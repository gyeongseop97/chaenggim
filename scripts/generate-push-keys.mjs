import { webcrypto } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.dev.vars', import.meta.url));
const subject = process.argv[2];
function validSubject(value) {
  if (typeof value !== 'string' || /[\r\n'"\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol === 'mailto:') return /^[^@<>]+@[^@<>]+\.[^@<>]+$/.test(url.pathname) && !url.search && !url.hash;
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
if (!validSubject(subject)) {
  console.error('사용법: node scripts/generate-push-keys.mjs mailto:본인연락이메일');
  console.error('mailto: 이메일 또는 본인이 운영하는 HTTPS 주소를 지정해 주세요.');
  process.exitCode = 1;
} else {
  try {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
    const publicRaw = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey));
    const lines = [
      '# Local development secrets. Never commit this file.',
      'KMA_API_KEY=',
      `VAPID_PUBLIC_KEY=${publicRaw.toString('base64url')}`,
      `VAPID_PRIVATE_JWK='${JSON.stringify(privateJwk)}'`,
      `VAPID_SUBJECT=${subject}`,
      'PUSH_SCHEDULER_READY=false',
      '',
    ];
    await writeFile(target, lines.join('\n'), { flag: 'wx', mode: 0o600 });
    console.info('새 Web Push 키를 .dev.vars에 저장했습니다. 키 값은 화면에 출력하지 않습니다.');
    console.info('운영용 비밀 값은 backend/README.md에 따라 Cloudflare에 등록해 주세요.');
  } catch (error) {
    console.error(error?.code === 'EEXIST'
      ? '.dev.vars가 이미 있어 덮어쓰지 않았습니다. 기존 키를 보관하고 해당 파일을 사용해 주세요.'
      : '키 파일을 저장하지 못했습니다. 폴더의 쓰기 권한을 확인해 주세요.');
    process.exitCode = 1;
  }
}
