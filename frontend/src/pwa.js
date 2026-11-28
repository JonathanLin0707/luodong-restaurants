// 只在正式建置（import.meta.env.PROD）且瀏覽器支援時註冊 service worker；
// 開發模式與 Vitest 都不註冊，避免快取干擾開發。
export function registerServiceWorker({
  isProd = import.meta.env.PROD,
  win = typeof window === 'undefined' ? undefined : window,
} = {}) {
  if (!isProd || !win || !win.navigator || !('serviceWorker' in win.navigator)) return false
  const register = () => {
    win.navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker 註冊失敗：', err)
    })
  }
  if (win.document && win.document.readyState === 'complete') {
    register()
  } else {
    win.addEventListener('load', register, { once: true })
  }
  return true
}

export function isStandaloneDisplay(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return false
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(display-mode: standalone)') : null
  return Boolean((mq && mq.matches) || (win.navigator && win.navigator.standalone === true))
}
