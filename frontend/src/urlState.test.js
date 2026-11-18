import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_RADIUS_METERS,
  districtLabelForCoordinates,
  formatCoordinates,
  parseAppUrl,
  resolveRadius,
  syncAppUrl,
  toAppUrlParams,
} from './urlState.js'
import taiwanDistricts from './data/taiwan-districts.json'

const LUODONG = taiwanDistricts.find((district) => district.label === '宜蘭縣羅東鎮')

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('urlState - 讀取網址', () => {
  it('空網址視為未選地點，半徑回預設值', () => {
    expect(parseAppUrl('')).toEqual({
      location: null,
      locationQuery: '',
      radius: DEFAULT_RADIUS_METERS,
      category: '',
      sort: '',
    })
  })

  it('行政區中心座標會還原成選單上的名稱', () => {
    const state = parseAppUrl(`?lat=${LUODONG.lat}&lng=${LUODONG.lng}&category=${encodeURIComponent('台式')}&sort=rating`)
    expect(state.location).toEqual({ lat: LUODONG.lat, lng: LUODONG.lng, label: '宜蘭縣羅東鎮' })
    expect(state.locationQuery).toBe('宜蘭縣羅東鎮')
    expect(state.category).toBe('台式')
    expect(state.sort).toBe('rating')
  })

  it('非行政區中心的座標仍可還原，標題用座標表示且不會硬塞進搜尋框', () => {
    const state = parseAppUrl('?lat=24.6778&lng=121.7684')
    expect(state.location.label).toBe('24.6778, 121.7684')
    expect(state.locationQuery).toBe('')
  })

  it('座標不合法或只有一半時當作未選地點，殘留的分類/排序一併忽略', () => {
    for (const search of ['?lat=abc&lng=121.7', '?lat=91&lng=121.7', '?lat=24.6&lng=181', '?lat=24.6', '?lng=121.7']) {
      const state = parseAppUrl(`${search}&category=${encodeURIComponent('台式')}&sort=rating`)
      expect(state.location).toBeNull()
      expect(state.category).toBe('')
      expect(state.sort).toBe('')
    }
  })

  it('不認得的排序值不會被當成星數排序', () => {
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&sort=name').sort).toBe('')
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&sort=rating').sort).toBe('rating')
  })
})

describe('urlState - 半徑', () => {
  it.each([
    ['6000', 6000],
    [6000, 6000],
    ['150.4', 150],
    ['100', 100],
    ['10000', 10000],
  ])('合法半徑 %s 保留為 %s', (raw, expected) => {
    expect(resolveRadius(raw)).toBe(expected)
  })

  it.each(['', ' ', 'abc', '99', '10001', '-500', null, undefined])('不合法半徑 %s 退回預設 1000', (raw) => {
    expect(resolveRadius(raw)).toBe(DEFAULT_RADIUS_METERS)
  })

  it('舊連結帶 radius=4000 仍保留並生效（不被新預設值 1000 覆寫）', () => {
    expect(resolveRadius('4000')).toBe(4000)
    const state = parseAppUrl('?lat=24.6778&lng=121.7684&radius=4000')
    expect(state.radius).toBe(4000)
    const params = toAppUrlParams({ location: { lat: 24.6778, lng: 121.7684 }, radius: 4000, category: '', sort: '' })
    expect(params.get('radius')).toBe('4000')
  })
})

describe('urlState - 寫回網址', () => {
  it('沒有地點時不帶任何參數', () => {
    expect(toAppUrlParams({ location: null, radius: 8000, category: '台式', sort: 'rating' }).toString()).toBe('')
  })

  it('預設半徑、全部分類、不排序都不寫進網址', () => {
    const params = toAppUrlParams({
      location: { lat: LUODONG.lat, lng: LUODONG.lng },
      radius: DEFAULT_RADIUS_METERS,
      category: '',
      sort: '',
    })
    expect(params.get('radius')).toBeNull()
    expect(params.get('category')).toBeNull()
    expect(params.get('sort')).toBeNull()
    expect(params.get('lat')).toBe(String(Number(LUODONG.lat.toFixed(5))))
  })

  it('讀寫來回後條件不變', () => {
    const initial = { lat: LUODONG.lat, lng: LUODONG.lng, label: LUODONG.label }
    const search = `?${toAppUrlParams({ location: initial, radius: 6000, category: '台式', sort: 'rating' })}`
    const parsed = parseAppUrl(search)
    expect(parsed.location.label).toBe(LUODONG.label)
    expect(parsed.radius).toBe(6000)
    expect(parsed.category).toBe('台式')
    expect(parsed.sort).toBe('rating')
  })

  it('寫入網址時保留其他參數與 hash', () => {
    window.history.replaceState(null, '', '/?utm_source=line&lat=1&lng=2#list')
    syncAppUrl({ location: { lat: LUODONG.lat, lng: LUODONG.lng }, radius: 6000, category: '台式', sort: '' })

    const params = new URLSearchParams(window.location.search)
    expect(params.get('utm_source')).toBe('line')
    expect(params.get('lat')).toBe(String(Number(LUODONG.lat.toFixed(5))))
    expect(params.get('radius')).toBe('6000')
    expect(params.get('category')).toBe('台式')
    expect(window.location.hash).toBe('#list')
  })

  it('沒有地點時清掉先前殘留的篩選參數，但保留其他參數', () => {
    window.history.replaceState(null, '', '/?lat=24.6&lng=121.7&radius=6000&category=a&sort=rating&utm_source=line')
    syncAppUrl({ location: null, radius: DEFAULT_RADIUS_METERS, category: '', sort: '' })

    expect(window.location.search).toBe('?utm_source=line')
  })

  it('條件沒變就不重複寫入網址（避免製造多餘的 history 步驟）', () => {
    window.history.replaceState(null, '', '/?utm_source=line')
    const before = window.location.href
    const replaceSpy = window.history.replaceState
    let calls = 0
    window.history.replaceState = (...args) => {
      calls += 1
      return replaceSpy.apply(window.history, args)
    }
    syncAppUrl({ location: null, radius: DEFAULT_RADIUS_METERS, category: '', sort: '' })
    syncAppUrl({ location: { lat: LUODONG.lat, lng: LUODONG.lng }, radius: DEFAULT_RADIUS_METERS, category: '', sort: '' })
    syncAppUrl({ location: { lat: LUODONG.lat, lng: LUODONG.lng }, radius: DEFAULT_RADIUS_METERS, category: '', sort: '' })
    window.history.replaceState = replaceSpy
    expect(calls).toBe(1)
    expect(window.location.href).not.toBe(before)
  })
})

describe('urlState - 座標顯示', () => {
  it('距行政區中心 110 公尺內視為同一區，超出則不是', () => {
    expect(districtLabelForCoordinates(LUODONG.lat + 0.0009, LUODONG.lng)).toBe('宜蘭縣羅東鎮')
    expect(districtLabelForCoordinates(LUODONG.lat + 0.002, LUODONG.lng)).toBe('')
  })

  it('純座標顯示到小數 5 位', () => {
    expect(formatCoordinates(24.677812345, 121.7684001)).toBe('24.67781, 121.7684')
  })
})
