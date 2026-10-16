import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import worker from '../backend/worker.mjs';
import { createVapidAuthorization } from '../backend/push-crypto.mjs';

async function testKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    VAPID_PUBLIC_KEY: Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'),
    VAPID_PRIVATE_JWK: await webcrypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

test('Worker enables same-origin server APIs and never caches its configuration', async () => {
  const response = await worker.fetch(new Request('https://weather.example/app-config.js'), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /serverApi: true/);
  const head = await worker.fetch(new Request('https://weather.example/app-config.js', { method: 'HEAD' }), {});
  assert.equal(await head.text(), '');
  assert.equal((await worker.fetch(new Request('https://weather.example/app-config.js', { method: 'POST' }), {})).status, 405);
});

test('Worker serves the static app and reports optional backends as unavailable without secrets', async () => {
  let requested;
  const response = await worker.fetch(new Request('https://weather.example/'), {
    ASSETS: { fetch(request) { requested = new URL(request.url).pathname; return new Response('app shell'); } },
  });
  assert.equal(requested, '/');
  assert.equal(await response.text(), 'app shell');
  const weather = await worker.fetch(new Request('https://weather.example/api/weather?latitude=35.85&longitude=128.50'), {});
  assert.equal(weather.status, 503);
  assert.equal((await weather.json()).code, 'KMA_KEY_MISSING');
  const notifications = await worker.fetch(new Request('https://weather.example/api/notifications/config'), {});
  assert.deepEqual(await notifications.json(), { available: false, deliveryReady: false, publicKey: null, leadMinutes: 30 });
  assert.equal((await worker.fetch(new Request('https://weather.example/api/unknown'), {})).status, 404);
});

test('A disabled schedule never touches the database or sends a push', () => {
  let waits = 0;
  worker.scheduled({}, { PUSH_SCHEDULER_READY: 'false', WEATHER_DB: { prepare() { throw new Error('unexpected database access'); } } }, { waitUntil() { waits++; } });
  worker.scheduled({}, { PUSH_SCHEDULER_READY: 'true' }, { waitUntil() { waits++; } });
  assert.equal(waits, 0);
});

test('An enabled schedule checks the database without any network request when no device is registered', async () => {
  const keys = await testKeys();
  let statements = 0;
  const tasks = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('unexpected network access'); };
  try {
    worker.scheduled({}, {
      ...keys,
      VAPID_SUBJECT: 'mailto:operator@example.invalid',
      PUSH_SCHEDULER_READY: 'true',
      WEATHER_DB: { prepare() { statements++; return { bind() { return this; }, async run() { return {}; }, async all() { return { results: [] }; } }; } },
    }, { waitUntil(task) { tasks.push(task); } });
    assert.equal(tasks.length, 1);
    await Promise.all(tasks);
    assert.equal(statements, 2);
  } finally { globalThis.fetch = previousFetch; }
});

test('VAPID requires the new operator contact and has no old hosted-site fallback', async () => {
  const keys = await testKeys();
  await assert.rejects(createVapidAuthorization('https://web.push.apple.com/test', keys), /INVALID_VAPID_SUBJECT/);
  await assert.rejects(createVapidAuthorization('https://web.push.apple.com/test', { ...keys, VAPID_SUBJECT: 'http://example.invalid' }), /INVALID_VAPID_SUBJECT/);
  assert.match(await createVapidAuthorization('https://web.push.apple.com/test', { ...keys, VAPID_SUBJECT: 'mailto:operator@example.invalid' }), /^vapid t=/);
});

test('Key generation writes only a local ignored file, never prints keys, and refuses to overwrite it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chaenggim-key-test-'));
  try {
    await mkdir(join(directory, 'scripts'));
    const script = join(directory, 'scripts', 'generate-push-keys.mjs');
    await copyFile(new URL('../scripts/generate-push-keys.mjs', import.meta.url), script);
    const result = spawnSync(process.execPath, [script, 'mailto:operator@example.invalid'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const values = await readFile(join(directory, '.dev.vars'), 'utf8');
    const publicKey = values.match(/^VAPID_PUBLIC_KEY=(.+)$/m)?.[1];
    const privateJwk = values.match(/^VAPID_PRIVATE_JWK='(.+)'$/m)?.[1];
    assert.equal(Buffer.from(publicKey, 'base64url').length, 65);
    assert.equal(JSON.parse(privateJwk).kty, 'EC');
    assert.equal((result.stdout + result.stderr).includes(publicKey), false);
    assert.equal((result.stdout + result.stderr).includes(JSON.parse(privateJwk).d), false);
    const second = spawnSync(process.execPath, [script, 'mailto:operator@example.invalid'], { encoding: 'utf8' });
    assert.equal(second.status, 1);
    assert.equal(await readFile(join(directory, '.dev.vars'), 'utf8'), values);
  } finally {
    const absolute = resolve(directory);
    assert.equal(dirname(absolute), resolve(tmpdir()));
    assert.equal(basename(absolute).startsWith('chaenggim-key-test-'), true);
    await rm(absolute, { recursive: true, force: true });
  }
});
