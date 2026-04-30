// ═══════════════════════════════════════════════════════
// sw.js — CIC TV Service Worker v2
// Estrategia: cache-first para assets, network-first para streams
// ═══════════════════════════════════════════════════════
const CACHE_NAME   = 'cic-tv-v2';
const CACHE_STATIC = 'cic-tv-static-v2';

// Assets que se cachean al instalar
const STATIC_ASSETS = [
  '/CIC-TV/',
  '/CIC-TV/index.html',
  '/CIC-TV/manifest.json',
  '/CIC-TV/auth.js',
  '/CIC-TV/monitor.js',
  '/CIC-TV/recomendados.js',
  '/CIC-TV/icons/icon-192.png',
  '/CIC-TV/icons/icon-512.png',
];

// ── Instalación ──────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      // Cachear assets estáticos (fallos silenciosos para los opcionales)
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activación ───────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== CACHE_STATIC;
        }).map(function(k) {
          return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Streams M3U8/media: siempre desde la red (no cachear)
  if (url.includes('.m3u8') || url.includes('.m3u') || url.includes('.ts') ||
      url.includes('stream') || url.includes('/live/') ||
      url.includes('supabase') || url.includes('api.anthropic')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response('', { status: 503 });
    }));
    return;
  }

  // JSON del repo (canales, radios, partidos): network-first con fallback cache
  if (url.includes('canales.json') || url.includes('radios.json') ||
      url.includes('partidos.json')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Assets estáticos (JS, CSS, HTML): cache-first
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          if (res && res.status === 200 && res.type === 'basic') {
            var clone = res.clone();
            caches.open(CACHE_STATIC).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        }).catch(function() {
          // Offline: devolver index.html para navegación
          if (e.request.mode === 'navigate') {
            return caches.match('/CIC-TV/index.html');
          }
          return new Response('', { status: 503 });
        });
      })
    );
  }
});

// ── Notificaciones Push ───────────────────────────────
self.addEventListener('push', function(e) {
  if (!e.data) return;
  try {
    var data = e.data.json();
    e.waitUntil(
      self.registration.showNotification(data.title || 'CIC TV', {
        body:    data.body    || 'Canal favorito disponible',
        icon:    data.icon    || '/CIC-TV/icons/icon-192.png',
        badge:   '/CIC-TV/icons/icon-96.png',
        tag:     data.tag     || 'cic-tv',
        data:    data.url     || '/CIC-TV/',
        actions: [{ action: 'open', title: 'Ver canal' }],
      })
    );
  } catch(err) {}
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = (e.notification.data) || '/CIC-TV/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(wins) {
      for (var i = 0; i < wins.length; i++) {
        if (wins[i].url === url && 'focus' in wins[i]) return wins[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
