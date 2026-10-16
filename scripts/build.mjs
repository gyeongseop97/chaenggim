import { cp, mkdir, readFile, rm, realpath, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, 'dist');
// Only this project's known output directory may be replaced.
if (output !== path.join(await realpath(root), 'dist')) throw new Error('Unexpected output directory');
try { if ((await lstat(output)).isSymbolicLink()) throw new Error('Output must not be a link'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const files = JSON.parse(await readFile(path.join(root, 'frontend-files.json'), 'utf8'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  const source = path.resolve(root, file);
  if (!source.startsWith(root + path.sep) || file.includes('..')) throw new Error('Unexpected asset path');
  await mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await cp(source, path.join(output, file));
}
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${files.length} public files into dist/.`);
