import { cp, readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist/static');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });

const versions = {};
for (const name of ['styles.css', 'site.js']) {
  versions[name] = createHash('sha256').update(await readFile(resolve(output, name))).digest('hex').slice(0, 12);
}
// Only Vercel builds include Analytics; the existing Sites build stays independent.
const analytics = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>\n<script defer src="/_vercel/insights/script.js"></script>`;
let pages = 0;
for (const name of await readdir(output)) {
  if (!name.endsWith('.html')) continue;
  const path = resolve(output, name);
  let html = await readFile(path, 'utf8');
  for (const [asset, version] of Object.entries(versions)) {
    html = html.replaceAll(`"${asset}"`, `"${asset}?v=${version}"`);
  }
  html = html.replace('</head>', `${analytics}\n</head>`);
  await writeFile(path, html);
  pages++;
}
console.log(`Built ${pages} static pages with Vercel Web Analytics.`);
