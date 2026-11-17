import districts from './data/taiwan-districts.json'

// 與 backend/src/app.js 的 resolveRadius 保持同一組界線與預設值：
// 後端超出範圍會退回預設 4000，前端照做，這樣網址寫出去的值一定就是實際查詢的值。
export const DEFAULT_RADIUS_METERS = 4000
export const MIN_RADIUS_METERS = 100
export const MAX_RADIUS_METERS = 10000

export const SORT_RATING = 'rating'

// 本頁會寫回網址的參數；其他參數（例如 utm_source）原樣保留，不隨條件變更被清掉。
export const APP_QUERY_KEYS = ['lat', 'lng', 'radius', 'category', 'sort']

// 行政區中心點比對容錯（度）。0.001 度約 110 公尺，遠小於相鄰鄉鎮市區的距離，
// 又足以吸收「座標寫進網址時四捨五入到小數 5 位」造成的誤差。
const DISTRICT_MATCH_EPSILON = 0.001

// 座標只留小數 5 位（約 1 公尺），還原同一地點夠精確，網址也不會過長。
const COORDINATE_DECIMALS = 5

function formatCoordinate(value) {
  return String(Number(Number(value).toFixed(COORDINATE_DECIMALS)))
}

function parseCoordinate(raw, min, max) {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!text) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < min || value > max) return null
  return value
}

// 半徑規則刻意與後端 resolveRadius 一致：不是有限數字、或超出 100–10000，就回預設 4000。
export function resolveRadius(rawRadius) {
  if (rawRadius === null || rawRadius === undefined) return DEFAULT_RADIUS_METERS
  const text = String(rawRadius).trim()
  if (!text) return DEFAULT_RADIUS_METERS
  const radius = Number(text)
  if (!Number.isFinite(radius) || radius < MIN_RADIUS_METERS || radius > MAX_RADIUS_METERS) {
    return DEFAULT_RADIUS_METERS
  }
  return Math.round(radius)
}

// 由座標回推行政區名稱。命中就沿用選單上顯示的「宜蘭縣羅東鎮」，
// 讓分享連結重新打開時標題與地點欄位跟原本一致。
export function districtLabelForCoordinates(lat, lng) {
  const match = districts.find(
    (district) =>
      Math.abs(district.lat - lat) <= DISTRICT_MATCH_EPSILON &&
      Math.abs(district.lng - lng) <= DISTRICT_MATCH_EPSILON,
  )
  return match ? match.label : ''
}

export function formatCoordinates(lat, lng) {
  return `${formatCoordinate(lat)}, ${formatCoordinate(lng)}`
}

// 把目前網址讀成畫面狀態。沒有合法 lat/lng 就視為「還沒選地點」，
// 分類與排序也一併忽略，避免網址殘留條件讓畫面看似有篩選卻沒有地點。
export function parseAppUrl(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '')
  const lat = parseCoordinate(params.get('lat'), -90, 90)
  const lng = parseCoordinate(params.get('lng'), -180, 180)
  const hasLocation = lat !== null && lng !== null

  const districtLabel = hasLocation ? districtLabelForCoordinates(lat, lng) : ''
  const category = hasLocation ? (params.get('category') || '').trim() : ''
  const sort = hasLocation && (params.get('sort') || '').trim() === SORT_RATING ? SORT_RATING : ''

  return {
    location: hasLocation
      ? { lat, lng, label: districtLabel || formatCoordinates(lat, lng) }
      : null,
    // 給地點輸入框回填用；只有認得出來的行政區才有文字，純座標不硬塞進搜尋框。
    locationQuery: districtLabel,
    radius: resolveRadius(params.get('radius')),
    category,
    sort,
  }
}

// 把畫面狀態轉成網址參數。預設值不寫進網址：半徑 4000、全部分類、不排序。
export function toAppUrlParams({ location, radius, category, sort } = {}) {
  const params = new URLSearchParams()
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return params

  params.set('lat', formatCoordinate(location.lat))
  params.set('lng', formatCoordinate(location.lng))

  const resolvedRadius = resolveRadius(radius)
  if (resolvedRadius !== DEFAULT_RADIUS_METERS) params.set('radius', String(resolvedRadius))

  const trimmedCategory = typeof category === 'string' ? category.trim() : ''
  if (trimmedCategory) params.set('category', trimmedCategory)

  if (sort === SORT_RATING) params.set('sort', SORT_RATING)

  return params
}

// 用 replaceState 更新網址：重新整理與分享都拿得到同一組條件，
// 但不在瀏覽器歷史多留一筆，使用者按上一頁不會被每個篩選動作卡住。
export function syncAppUrl(state, windowRef = typeof window === 'undefined' ? null : window) {
  if (!windowRef || !windowRef.history || !windowRef.location) return ''

  const params = new URLSearchParams(windowRef.location.search || '')
  for (const key of APP_QUERY_KEYS) params.delete(key)
  toAppUrlParams(state).forEach((value, key) => params.set(key, value))

  const query = params.toString()
  const nextSearch = query ? `?${query}` : ''
  if (nextSearch === (windowRef.location.search || '')) return nextSearch

  const nextUrl = `${windowRef.location.pathname}${nextSearch}${windowRef.location.hash || ''}`
  windowRef.history.replaceState(windowRef.history.state ?? null, '', nextUrl)
  return nextSearch
}
