// Service worker: делает chesai устанавливаемым приложением и ускоряет
// повторные запуски. Регистрируется из js/pwa.js.
//
// Стратегии:
//  - страницы, js и css — сначала сеть (свежая версия сразу после выкладки),
//    без сети — из кэша, чтобы приложение открывалось и офлайн;
//  - vendor/ и stockfish/ — сначала кэш: в именах файлов уже есть версия,
//    а движок весит 7 МБ, качать его при каждом запуске незачем;
//  - картинки, звуки и шрифты — из кэша сразу, в фоне обновляем.
// Запросы к Supabase и нейросети (другие домены, POST) не трогаем.
'use strict';

const CACHE = 'chesai-v1';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'assests/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

  if (!sameOrigin || url.pathname.includes('/assests/')) {
    event.respondWith(staleWhileRevalidate(event, req));
  } else if (url.pathname.includes('/vendor/') || url.pathname.includes('/stockfish/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(stripSearch(req), resp.clone());
    return resp;
  } catch (e) {
    const cached = await cache.match(stripSearch(req));
    if (cached) return cached;
    // Офлайн-переход на страницу с параметрами (?paid=1 и т.п.) — отдаём главную
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const resp = await fetch(req);
  if (resp.ok) cache.put(req, resp.clone());
  return resp;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fresh = fetch(req).then((resp) => {
    if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
    return resp;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

// Страница с ?buy=… или ?paid=1 — та же index.html, не плодим копии в кэше.
function stripSearch(req) {
  const url = new URL(req.url);
  if (!url.search) return req;
  url.search = '';
  return url.toString();
}
