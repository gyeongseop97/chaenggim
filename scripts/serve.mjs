import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const files = new Set(JSON.parse(await readFile(path.join(root, 'frontend-files.json'), 'utf8')));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8'};
export async function startServer({ port = 4173, base = '/' } = {}) {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid base path');
  const server = http.createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === base.slice(0, -1) && base !== '/') { response.writeHead(308, {location: base}).end(); return; }
    const file = pathname.startsWith(base) ? pathname.slice(base.length) || 'index.html' : '';
    if (!['GET','HEAD'].includes(request.method) || !files.has(file)) { response.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(path.join(root, file));
      response.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-cache','permissions-policy':'geolocation=(self)','x-content-type-options':'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, url: `http://127.0.0.1:${server.address().port}${base}` };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const {url} = await startServer({port: Number(process.env.PORT || 4173)});
  console.log(`Local: ${url}`);
}
