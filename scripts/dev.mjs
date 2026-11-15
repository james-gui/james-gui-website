import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import worker, { setAssets } from '../worker/index.js';

const root = resolve(import.meta.dirname, '../public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
async function collect(dir = root, prefix = '') {
  const assets = {};
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}/${item.name}`;
    if (item.isDirectory()) Object.assign(assets, await collect(resolve(dir, item.name), path));
    else assets[path] = { type: types[extname(path)] || 'text/plain', body: (await readFile(resolve(dir, item.name))).toString('base64') };
  }
  return assets;
}
createServer(async (req, res) => {
  try {
    setAssets(await collect());
    const response = await worker.fetch(new Request(`http://127.0.0.1:4173${req.url}`, { method: req.method, headers: req.headers }), {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('preview error'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
