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
      openNow: false,
      minRating: 0,
      priceLevel: '',
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

describe('urlState - 排序與營業中（新）', () => {
  it('sort=distance 會被解析為 distance', () => {
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&sort=distance').sort).toBe('distance')
  })

  it('未知排序值降級為空字串', () => {
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&sort=distance2').sort).toBe('')
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&sort=foo').sort).toBe('')
  })

  it('openNow=1 或 true 會被解析為 true，其他為 false', () => {
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&openNow=1').openNow).toBe(true)
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&openNow=true').openNow).toBe(true)
    expect(parseAppUrl('?lat=24.6778&lng=121.7684&openNow=0').openNow).toBe(false)
    expect(parseAppUrl('?lat=24.6778&lng=121.7684').openNow).toBe(false)
  })

  it('沒有地點時 openNow 與 sort 一併忽略', () => {
    const state = parseAppUrl('?openNow=1&sort=distance')
    expect(state.location).toBeNull()
    expect(state.openNow).toBe(false)
    expect(state.sort).toBe('')
  })

  it('toAppUrlParams：sort=distance 與 openNow=true 會寫入網址，預設不寫', () => {
    const loc = { lat: 24.6778, lng: 121.7684 }
    const params = toAppUrlParams({ location: loc, sort: 'distance', openNow: true })
    expect(params.get('sort')).toBe('distance')
    expect(params.get('openNow')).toBe('1')

    const def = toAppUrlParams({ location: loc, sort: '', openNow: false })
    expect(def.get('sort')).toBeNull()
    expect(def.get('openNow')).toBeNull()
  })

  it('讀寫來回後 openNow / sort 不變', () => {
    const loc = { lat: 24.6778, lng: 121.7684 }
    const search = '?' + toAppUrlParams({ location: loc, sort: 'distance', openNow: true })
    const parsed = parseAppUrl(search)
    expect(parsed.sort).toBe('distance')
    expect(parsed.openNow).toBe(true)
  })
})

describe('urlState - 最低評分（新）', () => {
  const LOC = '?lat=24.6778&lng=121.7684'

  it('minRating 只接受 3.5／4／4.5，其他值（含 0、亂填、超出範圍）一律視為不限', () => {
    expect(parseAppUrl(`${LOC}&minRating=4`).minRating).toBe(4)
    expect(parseAppUrl(`${LOC}&minRating=4.5`).minRating).toBe(4.5)
    expect(parseAppUrl(`${LOC}&minRating=3.5`).minRating).toBe(3.5)
    expect(parseAppUrl(`${LOC}&minRating=0`).minRating).toBe(0)
    expect(parseAppUrl(`${LOC}&minRating=abc`).minRating).toBe(0)
    expect(parseAppUrl(`${LOC}&minRating=4.2`).minRating).toBe(0)
    expect(parseAppUrl(`${LOC}`).minRating).toBe(0)
  })

  it('沒有地點時 minRating 一併忽略', () => {
    expect(parseAppUrl('?minRating=4').minRating).toBe(0)
  })

  it('toAppUrlParams：不限不寫入網址，4.0 寫成 minRating=4，來回讀寫不變', () => {
    const loc = { lat: 24.6778, lng: 121.7684, label: 'x' }
    expect(toAppUrlParams({ location: loc, minRating: 0 }).get('minRating')).toBeNull()
    expect(toAppUrlParams({ location: loc, minRating: 4 }).get('minRating')).toBe('4')
    const search = '?' + toAppUrlParams({ location: loc, minRating: 3.5 })
    expect(parseAppUrl(search).minRating).toBe(3.5)
  })
})

describe('urlState - 價位篩選與人氣排序', () => {
  const LOC = '?lat=24.6778&lng=121.7684'

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['4', 4],
  ])('priceLevel=%s 會被還原成 %s', (raw, expected) => {
    expect(parseAppUrl(`${LOC}&priceLevel=${raw}`).priceLevel).toBe(expected)
  })

  it.each(['abc', '5', '-1', '2.5'])('不合法的 priceLevel %s 當成不限', (raw) => {
    expect(parseAppUrl(`${LOC}&priceLevel=${raw}`).priceLevel).toBe('')
  })

  it('priceLevel 空白也是不限', () => {
    expect(parseAppUrl(`${LOC}&priceLevel=`).priceLevel).toBe('')
  })

  it('沒有地點時 priceLevel 一併忽略', () => {
    expect(parseAppUrl('?priceLevel=3').priceLevel).toBe('')
  })

  it('不限不寫入網址，0（免費）與 1–4 都會寫入，來回讀寫不變', () => {
    const loc = { lat: 24.6778, lng: 121.7684 }
    expect(toAppUrlParams({ location: loc, priceLevel: '' }).get('priceLevel')).toBeNull()
    expect(toAppUrlParams({ location: loc, priceLevel: 0 }).get('priceLevel')).toBe('0')
    expect(toAppUrlParams({ location: loc, priceLevel: 2 }).get('priceLevel')).toBe('2')
    expect(parseAppUrl('?' + toAppUrlParams({ location: loc, priceLevel: 0 })).priceLevel).toBe(0)
    const search = '?' + toAppUrlParams({ location: loc, priceLevel: 4 })
    expect(parseAppUrl(search).priceLevel).toBe(4)
  })

  it('sort=popular 會被解析與寫回，未知排序降級為空字串', () => {
    expect(parseAppUrl(`${LOC}&sort=popular`).sort).toBe('popular')
    expect(parseAppUrl(`${LOC}&sort=popularity`).sort).toBe('')
    const params = toAppUrlParams({ location: { lat: 24.6778, lng: 121.7684 }, sort: 'popular' })
    expect(params.get('sort')).toBe('popular')
    expect(parseAppUrl(`?${params}`).sort).toBe('popular')
  })

  it('syncAppUrl 換掉舊的價位與排序參數', () => {
    window.history.replaceState(null, '', '/?lat=24.6&lng=121.7&priceLevel=3&sort=popular&utm_source=line')
    syncAppUrl({ location: { lat: 24.6778, lng: 121.7684 }, priceLevel: '', sort: '' })
    const params = new URLSearchParams(window.location.search)
    expect(params.get('priceLevel')).toBeNull()
    expect(params.get('sort')).toBeNull()
    expect(params.get('utm_source')).toBe('line')
  })
})
