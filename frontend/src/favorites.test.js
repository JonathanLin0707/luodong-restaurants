import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isFavorite,
  loadFavorites,
  removeFavorite,
  saveFavorites,
  toggleFavorite,
} from './favorites.js'

const STORAGE_KEY = 'luodong-restaurants-favorites'

const item = {
  placeId: 'p1',
  name: '羅東夜市小吃',
  rating: 4.5,
  userRatingsTotal: 120,
  address: '宜蘭縣羅東鎮民權路1號',
  category: '小吃',
  priceLevel: 1,
  mapsUrl: 'https://maps.google.com/?cid=p1',
  distanceMeters: 500,
  isOpen: true,
}

let store

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
  })
})

describe('favorites - load/save/toggle', () => {
  it('load 空 localStorage 回傳空陣列', () => {
    expect(loadFavorites()).toEqual([])
  })

  it('save 後 load 只保留展示欄位，不含 distanceMeters/isOpen', () => {
    saveFavorites([item])
    const loaded = loadFavorites()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toEqual({
      placeId: 'p1',
      name: '羅東夜市小吃',
      rating: 4.5,
      userRatingsTotal: 120,
      address: '宜蘭縣羅東鎮民權路1號',
      category: '小吃',
      priceLevel: 1,
      mapsUrl: 'https://maps.google.com/?cid=p1',
    })
    expect(loaded[0]).not.toHaveProperty('distanceMeters')
    expect(loaded[0]).not.toHaveProperty('isOpen')
  })

  it('toggle 加入再移除', () => {
    let list = []
    list = toggleFavorite(list, item)
    expect(isFavorite(list, 'p1')).toBe(true)
    list = toggleFavorite(list, item)
    expect(isFavorite(list, 'p1')).toBe(false)
    expect(list).toEqual([])
  })

  it('removeFavorite 只移除指定 placeId', () => {
    const other = { ...item, placeId: 'p2', name: '林場肉羹' }
    const list = [item, other]
    expect(removeFavorite(list, 'p1')).toEqual([other])
  })

  it('localStorage 內容損壞時 load 回傳空陣列', () => {
    store.set(STORAGE_KEY, '{not json')
    expect(loadFavorites()).toEqual([])
  })

  it('save 後清空 localStorage，load 回傳空陣列', () => {
    saveFavorites([item])
    store.delete(STORAGE_KEY)
    expect(loadFavorites()).toEqual([])
  })
})
