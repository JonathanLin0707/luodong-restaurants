const STORAGE_KEY = 'luodong-restaurants-favorites'

// 只存卡片展示所需欄位，不存 distanceMeters/isOpen：兩者隨地點與查詢時間變動。
const STORED_FIELDS = ['placeId', 'name', 'rating', 'userRatingsTotal', 'address', 'category', 'priceLevel', 'mapsUrl']

function safeStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function normalize(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.placeId !== 'string' || !entry.placeId) return null
  const item = {}
  for (const field of STORED_FIELDS) {
    if (entry[field] != null) item[field] = entry[field]
  }
  return item
}

export function loadFavorites() {
  const storage = safeStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize).filter(Boolean)
  } catch {
    return []
  }
}

export function saveFavorites(favorites) {
  const storage = safeStorage()
  if (!storage) return
  try {
    const list = Array.isArray(favorites) ? favorites.map(normalize).filter(Boolean) : []
    storage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隱私模式或配額不足時靜默略過，不讓收藏功能拖垮畫面。
  }
}

export function isFavorite(favorites, placeId) {
  return favorites.some((item) => item.placeId === placeId)
}

export function toggleFavorite(favorites, restaurant) {
  if (!restaurant || !restaurant.placeId) return favorites
  if (isFavorite(favorites, restaurant.placeId)) {
    return favorites.filter((item) => item.placeId !== restaurant.placeId)
  }
  const entry = normalize(restaurant)
  if (!entry) return favorites
  return [...favorites, entry]
}

export function removeFavorite(favorites, placeId) {
  return favorites.filter((item) => item.placeId !== placeId)
}
