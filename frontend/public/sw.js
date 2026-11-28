/* 附近餐廳推薦 service worker（手寫，不用外掛）。
 * __SW_VERSION__ 在 npm run build 時由 vite.config.js 自動換成 commit 或建置時間，不要手改。
 * 只快取：/offline.html、/assets/*（帶 hash）、/icons/*、/manifest.webmanifest。
 * 不快取：其他網域（Google Maps 等）、/api/*、非 GET 請求。
 */
const VERSION = '__SW_VERSION__'
const CACHE_NAME = `luodong-pwa-${VERSION}`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('luodong-pwa-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isCacheableStatic(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.webmanifest'
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 1. 只處理同源；Google Maps、googleapis 等外部請求完全不碰。
  if (url.origin !== self.location.origin) return
  // 2. 不碰 API 與非 GET。
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return

  // 3. 導覽：network-first、不設逾時（Render 冷啟動可能很久），斷網才回離線頁。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || Response.error()),
      ),
    )
    return
  }

  // 4. 帶 hash 的靜態檔、圖示、manifest：cache-first，執行時才放進快取。
  if (isCacheableStatic(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone())
            return res
          })
        }),
      ),
    )
  }
  // 其他同源請求交給瀏覽器預設處理。
})
