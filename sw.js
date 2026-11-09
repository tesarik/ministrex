/* Service worker – hra jde nainstalovat do mobilu a hrát offline.
   Soubory hry: nejdřív síť (vždy nejnovější verze), bez sítě z mezipaměti.
   Proto tu není žádné číslo verze, které by se muselo hlídat.
   Písma z Google Fonts: nejdřív mezipaměť (nemění se).
   Registruje se v js/game.js jen přes http(s); z file:// se hra chová jako dřív. */
'use strict';

const CACHE = 'ministrex';
const FONTS = 'ministrex-fonts';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/sprite-art.js',
  'js/sprites.js',
  'js/audio.js',
  'js/data/items.js',
  'js/data/sections.js',
  'js/game.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const NET_TIMEOUT = 4000; // ms – na pomalé síti raději hned z mezipaměti

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const cached = await cache.match(req, { ignoreSearch: true });
  if (!cached) return net;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NET_TIMEOUT));
  return Promise.race([net.catch(() => cached), timeout]);
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
});
