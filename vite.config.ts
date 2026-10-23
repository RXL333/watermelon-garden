import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173 },
  build: { target: 'es2020', emptyOutDir: false, manifest: true, chunkSizeWarningLimit: 1600 },
  plugins: [{
    name: 'garden-offline',
    apply: 'build',
    closeBundle() {
      const collect = (dir: string, prefix = ''): string[] => readdirSync(dir, { withFileTypes: true })
        .flatMap(entry => entry.isDirectory() ? collect(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
      // Use Vite's current manifest: older local builds must not enter the offline cache.
      const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8')) as Record<string, { file: string; css?: string[]; assets?: string[] }>;
      const files = [...new Set(['index.html', ...collect('public').filter(file => !file.startsWith('.')), ...Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])])])];
      const hash = createHash('sha256');
      for (const file of files.sort()) hash.update(readFileSync(join('dist', file)));
      const version = hash.digest('hex').slice(0, 12);
      writeFileSync('dist/sw.js', `
const PREFIX = 'watermelon-garden:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files)}.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true })));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});
`);
    }
  }]
});
