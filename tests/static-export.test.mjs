import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { startServer } from '../scripts/serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = JSON.parse(await readFile(path.join(root, 'frontend-files.json'), 'utf8'));
test('GitHub project paths serve the complete app and never expose private files', async () => {
  const {server,origin,url} = await startServer({port:0,base:'/chaenggim/'});
  try {
    for (const file of files) assert.equal((await fetch(url+file)).status,200,file);
    for (const file of ['.env.local','.dev.vars','backend/push-crypto.mjs','package.json','../.env.local']) assert.equal((await fetch(url+file)).status,404,file);
    assert.equal((await fetch(origin+'/api/weather')).status,404);
    assert.equal((await fetch(origin+'/chaenggim/api/weather')).status,404);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('all script, style, manifest, and icon references work below a repository path', async () => {
  const html = await readFile(path.join(root,'index.html'),'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match=>match[1]).filter(url=>!/^https?:|^data:/.test(url));
  for(const reference of references){
    assert.ok(!reference.startsWith('/'),reference);
    const file = reference.split('?')[0].replace(/^\.\//,'');
    assert.ok(files.includes(file),'Missing public asset: '+file);
  }
  assert.ok(html.indexOf('app-config.js')<html.indexOf('weather-live.js'));
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.scope,'./');assert.equal(manifest.id,'./');
  assert.ok(manifest.start_url.startsWith('./'));
  for(const icon of manifest.icons)assert.ok(files.includes(icon.src.split('?')[0]));
  const scope={window:{}};vm.runInNewContext(await readFile(path.join(root,'app-config.js'),'utf8'),scope);
  assert.equal(scope.window.ChaenggimConfig.serverApi,false);
});
test('public build list contains no server code, account identity, or local secrets', async () => {
  assert.equal(new Set(files).size,files.length);
  assert.ok(files.every(file=>!/(?:^|\/)(?:backend|node_modules|tests|scripts|\.env|\.dev\.vars|\.git|\.openai)(?:\/|\.|$)/.test(file)));
  for(const file of files.filter(file=>/\.(?:js|html|css|webmanifest)$/.test(file))){
    const text=await readFile(path.join(root,file),'utf8');
    assert.doesNotMatch(text,/https?:\/\/[^\s'"<>]*\.chatgpt\.site|appgprj_|appgdep_|[A-Z]:\\(?:Users|GPT)\\/,file);
  }
  const names=await readdir(root);assert.equal(names.includes('.env.local'),false);
});
