// 준자몬스터즈 서비스 워커: 앱 설치용. 항상 최신 버전을 먼저 받고(네트워크 우선), 끊겼을 때만 저장본 사용
const CACHE = 'jm-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && new URL(req.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
    return res;
  }).catch(() => caches.match(req)));
});
