const RESTAURANTS_URL = '/api/restaurants'
const CATEGORIES_URL = '/api/categories'

async function handleResponse(res) {
  if (!res.ok) {
    throw new Error(`請求失敗 (${res.status})`)
  }
  return res.json()
}

export async function fetchRestaurants({ category, sort, lat, lng, radius } = {}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (sort) params.set('sort', sort)
  if (lat != null) params.set('lat', lat)
  if (lng != null) params.set('lng', lng)
  if (radius != null) params.set('radius', radius)
  const query = params.toString()
  const res = await fetch(query ? `${RESTAURANTS_URL}?${query}` : RESTAURANTS_URL)
  return handleResponse(res)
}

export async function fetchCategories({ lat, lng, radius } = {}) {
  const params = new URLSearchParams()
  if (lat != null) params.set('lat', lat)
  if (lng != null) params.set('lng', lng)
  if (radius != null) params.set('radius', radius)
  const query = params.toString()
  const res = await fetch(query ? `${CATEGORIES_URL}?${query}` : CATEGORIES_URL)
  return handleResponse(res)
}
