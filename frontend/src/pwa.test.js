import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './pwa.js'

function fakeWindow({ readyState = 'complete', withSW = true } = {}) {
  const listeners = {}
  const register = vi.fn().mockResolvedValue({})
  return {
    register,
    listeners,
    win: {
      navigator: withSW ? { serviceWorker: { register } } : {},
      document: { readyState },
      addEventListener: vi.fn((type, fn) => {
        listeners[type] = fn
      }),
    },
  }
}

describe('registerServiceWorker', () => {
  it('開發模式（非 PROD）不註冊', () => {
    const { win, register } = fakeWindow()
    expect(registerServiceWorker({ isProd: false, win })).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })

  it('瀏覽器不支援 service worker 時不註冊', () => {
    const { win } = fakeWindow({ withSW: false })
    expect(registerServiceWorker({ isProd: true, win })).toBe(false)
  })

  it('PROD 時等 load 事件後才註冊 /sw.js', () => {
    const { win, register, listeners } = fakeWindow({ readyState: 'loading' })
    expect(registerServiceWorker({ isProd: true, win })).toBe(true)
    expect(register).not.toHaveBeenCalled()
    listeners.load()
    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('Vitest 預設環境（非 PROD）呼叫也不會註冊', () => {
    expect(registerServiceWorker()).toBe(false)
  })
})

// 直接執行 public/sw.js，確認 fetch 規則：外部網域、/api、非 GET 一律不攔。
function loadServiceWorker() {
  const handlers = {}
  const origin = 'https://example.test'
  const context = {
    URL,
    Request: class {
      constructor(url, init) {
        this.url = url
        Object.assign(this, init)
      }
    },
    Response: { error: () => 'error-response' },
    Promise,
    console,
    fetch: vi.fn().mockResolvedValue({ ok: true, clone: () => ({}) }),
    caches: {
      open: vi.fn().mockResolvedValue({ match: vi.fn().mockResolvedValue(undefined), put: vi.fn() }),
      match: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    },
    self: {
      location: { origin },
      addEventListener: (type, fn) => {
        handlers[type] = fn
      },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8')
  vm.runInNewContext(source, context)
  const dispatchFetch = (url, { method = 'GET', mode = 'cors' } = {}) => {
    const respondWith = vi.fn()
    handlers.fetch({ request: { url, method, mode }, respondWith })
    return respondWith
  }
  return { handlers, context, dispatchFetch, origin }
}

describe('service worker 快取規則（public/sw.js）', () => {
  it('不攔 Google Maps / googleapis 等外部網域', () => {
    const { dispatchFetch } = loadServiceWorker()
    expect(dispatchFetch('https://maps.googleapis.com/maps/api/js?key=x')).not.toHaveBeenCalled()
    expect(dispatchFetch('https://maps.gstatic.com/tile.png')).not.toHaveBeenCalled()
  })

  it('不攔 /api/* 與非 GET 請求', () => {
    const { dispatchFetch, origin } = loadServiceWorker()
    expect(dispatchFetch(`${origin}/api/restaurants?lat=1&lng=2`)).not.toHaveBeenCalled()
    expect(dispatchFetch(`${origin}/assets/app.js`, { method: 'POST' })).not.toHaveBeenCalled()
  })

  it('攔導覽請求與 /assets/*、圖示、manifest', () => {
    const { dispatchFetch, origin } = loadServiceWorker()
    expect(dispatchFetch(`${origin}/?location=x`, { mode: 'navigate' })).toHaveBeenCalled()
    expect(dispatchFetch(`${origin}/assets/index-abc123.js`)).toHaveBeenCalled()
    expect(dispatchFetch(`${origin}/icons/icon-192.png`)).toHaveBeenCalled()
    expect(dispatchFetch(`${origin}/manifest.webmanifest`)).toHaveBeenCalled()
  })

  it('其他同源檔案（例如 sw.js 本身）不攔', () => {
    const { dispatchFetch, origin } = loadServiceWorker()
    expect(dispatchFetch(`${origin}/sw.js`)).not.toHaveBeenCalled()
  })

  it('斷網時導覽回 /offline.html', async () => {
    const { dispatchFetch, context, origin } = loadServiceWorker()
    context.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    context.caches.match.mockResolvedValue('offline-page')
    const respondWith = dispatchFetch(`${origin}/`, { mode: 'navigate' })
    await expect(respondWith.mock.calls[0][0]).resolves.toBe('offline-page')
    expect(context.caches.match).toHaveBeenCalledWith('/offline.html')
  })

  it('原始檔保留 __SW_VERSION__ 佔位，快取名帶版本', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8')
    expect(source).toContain("const VERSION = '__SW_VERSION__'")
    expect(source).toContain('luodong-pwa-${VERSION}')
  })
})
