/* Kakeibo の public/sw.js から（Kakeibo 側で直したら合わせる） */
// 画面の外枠（HTML/JS/CSS/アイコン）だけをキャッシュする。
// メモのデータ（/api/*）はキャッシュしない。
// キャッシュ名の末尾はビルド時にビルドごとの値へ置き換わる。更新のたびに新しいキャッシュになり、古いものは activate で消える
const CACHE = 'memo-shell-__BUILD_ID__';
const SHELL = ['/', '/theme.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-cache') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    // 画面遷移はネットワーク優先。オフライン時のみキャッシュした外枠を返す
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname === '/theme.js') {
    // 画面の明るさを決めるスクリプト。ファイル名にハッシュがないためネットワーク優先、オフライン時はキャッシュ
    event.respondWith(fetch(event.request).catch(() => caches.match('/theme.js')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    // ビルド成果物はファイル名にハッシュが付くためキャッシュ優先でよい
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(event.request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

