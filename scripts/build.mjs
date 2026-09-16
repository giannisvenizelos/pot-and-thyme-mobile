import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edition = process.argv[2] || 'web';
if (!['web', 'mobile'].includes(edition)) throw new Error('Expected web or mobile');
const app = join(root, 'apps', edition);
const output = join(app, 'public');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const directory of [join(root, 'shared'), app]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['public', 'package.json', 'vercel.json'].includes(entry.name)) continue;
    await cp(join(directory, entry.name), join(output, entry.name), { recursive: true });
  }
}

// Each edition gets its own shell and cache version; changes invalidate offline assets.
const assets = [];
const hash = createHash('sha256');
async function collect(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) await collect(join(directory, entry.name), relative + '/');
    else {
      assets.push('/' + relative);
      hash.update(relative).update(await readFile(join(directory, entry.name)));
    }
  }
}
await collect(output);
const version = hash.digest('hex').slice(0, 12);
// A new HTML shell must fetch the matching code even while the previous worker is active.
for (const asset of assets.filter(asset => asset.endsWith('.html'))) {
  const file = join(output, asset.slice(1));
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace(/((?:src|href)=")([^"?#]+\.(?:js|css))(?:\?[^"#]*)?(")/g,
    (match, before, url, after) => url.startsWith('/') ? `${before}${url}?v=${version}${after}` : match));
}
const shellAssets = assets.map(asset => /\.(?:js|css)$/.test(asset) ? `${asset}?v=${version}` : asset);
const worker = `const CACHE=${JSON.stringify('pot-thyme-' + edition + '-' + version)};
const ASSETS=${JSON.stringify(['/', ...shellAssets])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pot-thyme-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname === '/' || url.pathname === '/index.html' ? '/' : event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
`;
await writeFile(join(output, 'sw.js'), worker);
console.log(`${edition}: ${assets.length} assets → ${output}`);
