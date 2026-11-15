import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const assets = {};
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(resolve(dir, entry.name), name);
    else assets[name] = { type: types[extname(name)] || 'application/octet-stream', body: (await readFile(resolve(dir, entry.name))).toString('base64') };
  }
}
await collect(resolve(root, 'public'));
// HTML revalidates on every visit. Version its styles and scripts as well so
// a newly deployed page cannot pick up a still-fresh stylesheet from an old build.
for (const path of ['/styles.css', '/site.js']) {
  assets[path].version = createHash('sha256').update(Buffer.from(assets[path].body, 'base64')).digest('hex').slice(0, 12);
}
for (const asset of Object.values(assets)) {
  if (!asset.type.startsWith('text/html')) continue;
  let html = Buffer.from(asset.body, 'base64').toString('utf8');
  html = html.replaceAll('href="styles.css"', `href="styles.css?v=${assets['/styles.css'].version}"`);
  html = html.replaceAll('src="site.js"', `src="site.js?v=${assets['/site.js'].version}"`);
  asset.body = Buffer.from(html).toString('base64');
}
const manifest = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (manifest.static || manifest.r2 !== 'SPOTIFY_STORE') throw new Error('Worker hosting configuration is incomplete.');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
const source = await readFile(resolve(root, 'worker/index.js'), 'utf8');
await writeFile(resolve(root, 'dist/server/index.js'), source + `\nsetAssets(${JSON.stringify(assets)});\n`);
await writeFile(resolve(root, 'dist/.openai/hosting.json'), JSON.stringify(manifest, null, 2));
const built = await import(resolve(root, 'dist/server/index.js'));
if (typeof built.default?.fetch !== 'function') throw new Error('Missing Worker fetch handler.');
console.log(`Built Worker with ${Object.keys(assets).length} assets.`);
