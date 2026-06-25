// KLP 대시보드 서비스워커 — PWA 설치 가능 + 네트워크 우선(항상 최신).
// 자주 배포되는 앱이라 캐시 우선은 "변경이 안 보이는" 문제를 일으키므로,
// 온라인이면 항상 네트워크에서 받고, 오프라인일 때만 마지막 캐시로 대체한다.
const CACHE = 'klp-cache-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) { if (k !== CACHE) await caches.delete(k); }
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // 저장/수정 등 비-GET은 그대로 통과
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // 같은 출처(우리 사이트) 정상 응답만 오프라인 대비로 캐시 (API/외부 CDN 제외)
      if (fresh && fresh.status === 200 && new URL(req.url).origin === self.location.origin) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});

// === 웹푸시 알림 ===
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: (e.data && e.data.text()) || '' }; }
  const title = data.title || 'KLP 대시보드';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(url); } catch (_) {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
