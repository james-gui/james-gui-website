import { cp, readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist/static');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });

const versions = {};
for (const name of ['styles.css', 'site.js', 'home-buddy.css', 'home-buddy.js']) {
  versions[name] = createHash('sha256').update(await readFile(resolve(output, name))).digest('hex').slice(0, 12);
}
const avatarVersion = createHash('sha256').update(await readFile(resolve(output, 'assets/james-avatar.png'))).digest('hex').slice(0, 12);
const avatarSource = encodeURIComponent(`/assets/james-avatar.png?v=${avatarVersion}`);
const avatarUrl = (width) => `/_vercel/image?url=${avatarSource}&amp;w=${width}&amp;q=75`;
const portraitVersion = createHash('sha256').update(await readFile(resolve(output, 'assets/james-portrait.jpg'))).digest('hex').slice(0, 12);
const portraitSource = encodeURIComponent(`/assets/james-portrait.jpg?v=${portraitVersion}`);
const portraitUrl = (width) => `/_vercel/image?url=${portraitSource}&amp;w=${width}&amp;q=75`;
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
  // Optimize displayed photos. Search favicons stay on stable PNG/ICO URLs.
  html = html.replace('<img src="assets/james-avatar.png" alt="" width="36" height="36">', `<img src="${avatarUrl(72)}" srcset="${avatarUrl(72)} 2x, ${avatarUrl(108)} 3x" alt="" width="36" height="36" decoding="async" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='/assets/james-avatar.png'">`);
  html = html.replace('<img data-portrait-thumbnail src="assets/james-portrait.jpg"', `<img data-portrait-thumbnail src="${portraitUrl(180)}" onerror="this.onerror=null;this.src='/assets/james-portrait.jpg'"`);
  html = html.replace('data-src="assets/james-portrait.jpg"', `data-src="${portraitUrl(960)}" data-srcset="${[360, 640, 960, 1280].map((width) => `${portraitUrl(width)} ${width}w`).join(', ')}" data-sizes="(max-width: 680px) 100vw, 480px"`);
  html = html.replace('</head>', `${analytics}\n</head>`);
  await writeFile(path, html);
  pages++;
}
console.log(`Built ${pages} static pages with Vercel Web Analytics.`);
