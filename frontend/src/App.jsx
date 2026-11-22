import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import RestaurantList from './components/RestaurantList.jsx'
import CategoryFilter from './components/CategoryFilter.jsx'
import SortControl from './components/SortControl.jsx'
import LocationPicker from './components/LocationPicker.jsx'
import RadiusControl from './components/RadiusControl.jsx'
import { fetchRestaurants } from './api.js'
import { parseAppUrl, syncAppUrl } from './urlState.js'
import { loadFavorites, removeFavorite, saveFavorites, toggleFavorite } from './favorites.js'

const CANDIDATE_COUNT = 5
const MAX_PAGES = 3

function shuffleArray(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export default function App() {
  // 第一次 render 就從網址還原條件：重新整理或開啟分享連結時，畫面直接是同一組查詢。
  const [initialUrlState] = useState(() =>
    parseAppUrl(typeof window === 'undefined' ? '' : window.location.search),
  )
  const [location, setLocation] = useState(initialUrlState.location)
  const [restaurants, setRestaurants] = useState([])
  // /api/restaurants 的回傳筆數與是否有下一頁（returnedCount / hasMore）。
  const [resultMeta, setResultMeta] = useState({ returnedCount: 0, hasMore: false })
  const [selectedCategory, setSelectedCategory] = useState(initialUrlState.category)
  const [sort, setSort] = useState(initialUrlState.sort || '')
  const [openNow, setOpenNow] = useState(Boolean(initialUrlState.openNow))
  const [minRating, setMinRating] = useState(initialUrlState.minRating)
  const [radius, setRadius] = useState(initialUrlState.radius)
  // 「載入更多」用頁數累加重新查，每次取代清單；上限 3 頁。
  const [pages, setPages] = useState(1)
  const [favorites, setFavorites] = useState(() => loadFavorites())
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [showWakeup, setShowWakeup] = useState(false)
  const genRef = useRef(0)
  const timerRef = useRef(null)
  const statusRef = useRef('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedPlaceId, setSelectedPlaceId] = useState(null)
  const [selectNonce, setSelectNonce] = useState(0)
  const [candidatePlaceIds, setCandidatePlaceIds] = useState(null)

  useEffect(() => {
    syncAppUrl({
      location,
      radius,
      category: selectedCategory,
      sort,
      openNow,
      minRating,
    })
  }, [location, radius, selectedCategory, sort, openNow, minRating])

  const loadRestaurants = useCallback(async () => {
    if (!location) return
    const gen = ++genRef.current
    clearTimeout(timerRef.current)
    setStatus('loading')
    statusRef.current = 'loading'
    setErrorMessage('')
    setShowWakeup(false)
    timerRef.current = setTimeout(() => {
      if (statusRef.current === 'loading') setShowWakeup(true)
    }, 3000)
    try {
      const data = await fetchRestaurants({
        category: selectedCategory || undefined,
        sort: sort || undefined,
        openNow: openNow ? true : undefined,
        minRating: minRating || undefined,
        lat: location.lat,
        lng: location.lng,
        radius,
        pages: pages > 1 ? pages : undefined,
      })
      if (gen !== genRef.current) return
      const list = Array.isArray(data?.restaurants) ? data.restaurants : []
      if (!Array.isArray(data?.restaurants)) {
        clearTimeout(timerRef.current)
        setShowWakeup(false)
        setErrorMessage('餐廳資料格式異常，請稍後再試')
        setStatus('error')
        statusRef.current = 'error'
        return
      }
      setRestaurants(list)
      setResultMeta({
        returnedCount: data.returnedCount ?? list.length,
        hasMore: Boolean(data.hasMore),
      })
      clearTimeout(timerRef.current)
      setShowWakeup(false)
      setStatus('ready')
      statusRef.current = 'ready'
    } catch (err) {
      if (gen !== genRef.current) return
      clearTimeout(timerRef.current)
      setShowWakeup(false)
      setErrorMessage(err.message || '載入餐廳資料失敗')
      setStatus('error')
      statusRef.current = 'error'
    }
  }, [location, radius, selectedCategory, sort, openNow, minRating, pages])

  useEffect(() => {
    loadRestaurants()
  }, [loadRestaurants])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // 任何查詢條件（含半徑）變更都回到第 1 頁，並清掉候選。
  useEffect(() => {
    setPages(1)
    setCandidatePlaceIds(null)
  }, [location, radius, selectedCategory, sort, openNow, minRating])

  const displayedRestaurants = useMemo(() => {
    if (!candidatePlaceIds) return restaurants
    return restaurants.filter((r) => candidatePlaceIds.includes(r.placeId))
  }, [restaurants, candidatePlaceIds])

  useEffect(() => {
    if (selectedPlaceId && !displayedRestaurants.some((r) => r.placeId === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [displayedRestaurants, selectedPlaceId])

  const favoriteIds = useMemo(() => favorites.map((item) => item.placeId), [favorites])

  const handleLocationChange = useCallback((nextLocation) => {
    setLocation(nextLocation)
    setSelectedCategory('')
  }, [])

  const handleToggleFavorite = useCallback((restaurant) => {
    setFavorites((prev) => {
      const next = toggleFavorite(prev, restaurant)
      saveFavorites(next)
      return next
    })
  }, [])

  const handleRemoveFavorite = useCallback((placeId) => {
    setFavorites((prev) => {
      const next = removeFavorite(prev, placeId)
      saveFavorites(next)
      return next
    })
  }, [])

  const handleLoadMore = useCallback(() => {
    // 用 genRef 去重，避免在載入中重複送出；每次只累加一頁，最多 3 頁。
    if (statusRef.current === 'loading') return
    if (pages >= MAX_PAGES) return
    setCandidatePlaceIds(null)
    setPages((p) => Math.min(MAX_PAGES, p + 1))
  }, [pages])

  // 清除篩選只回到預設分類、最低評分與營業中；排序與地點保留，避免一按就丟掉使用者選的地點。
  const hasActiveFilters = Boolean(selectedCategory || minRating || openNow)
  const handleClearFilters = useCallback(() => {
    setSelectedCategory('')
    setMinRating(0)
    setOpenNow(false)
  }, [])

  const handleSelectRestaurant = useCallback((restaurant) => {
    setSelectedPlaceId(restaurant.placeId)
    setSelectNonce((n) => n + 1)
  }, [])

  const handleOpenMaps = useCallback((restaurant) => {
    window.open(restaurant.mapsUrl, '_blank', 'noopener,noreferrer')
  }, [])

  const handleDrawCandidates = useCallback(() => {
    if (restaurants.length === 0) return
    const picked = shuffleArray(restaurants).slice(0, CANDIDATE_COUNT)
    setCandidatePlaceIds(picked.map((r) => r.placeId))
  }, [restaurants])

  const handleShowAll = useCallback(() => {
    setCandidatePlaceIds(null)
  }, [])

  return (
    <main className="app">
      <h1>附近餐廳推薦{location ? `：${location.label}` : ''}</h1>

      <LocationPicker
        onLocationChange={handleLocationChange}
        initialQuery={initialUrlState.locationQuery}
      />

      {location && (
        <div className="controls">
          <RadiusControl radius={radius} onChange={setRadius} />
          <CategoryFilter
            selectedCategory={selectedCategory}
            onChange={setSelectedCategory}
          />
          <SortControl
            sort={sort}
            onChange={setSort}
            minRating={minRating}
            onMinRatingChange={setMinRating}
          />
          <label className='open-now-control'>
            <input
              type='checkbox'
              checked={openNow}
              onChange={(e) => setOpenNow(e.target.checked)}
            />
            只看營業中
          </label>
          <button
            type="button"
            className="draw-candidates-button"
            onClick={handleDrawCandidates}
            disabled={restaurants.length === 0}
          >
            抽 5 家 🎲
          </button>
          {hasActiveFilters && (
            <button type="button" className="clear-filters-button" onClick={handleClearFilters}>
              清除篩選
            </button>
          )}
        </div>
      )}

      {favorites.length > 0 && (
        <section className='favorites-panel' aria-label='收藏清單'>
          <button
            type='button'
            className='favorites-toggle'
            aria-expanded={favoritesOpen}
            onClick={() => setFavoritesOpen((open) => !open)}
          >
            {favoritesOpen ? '▼' : '▶'} 收藏（{favorites.length}）
          </button>
          {favoritesOpen && (
            <ul className='favorites-list'>
              {favorites.map((item) => (
                <li key={item.placeId} className='favorite-item'>
                  <span className='favorite-info'>
                    <strong>{item.name}</strong>
                    <span>・{item.category}</span>
                    <span>・{item.address}</span>
                  </span>
                  <button
                    type='button'
                    className='favorite-map-link'
                    onClick={() => handleOpenMaps(item)}
                    aria-label={`在 Google 地圖開啟 ${item.name}`}
                  >
                    開啟地圖 ↗
                  </button>
                  <button
                    type='button'
                    className='favorite-remove'
                    onClick={() => handleRemoveFavorite(item.placeId)}
                    aria-label={`移除收藏 ${item.name}`}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="layout">
        <div className="list-column">
          {!location && <p className="empty-state">請先選擇地點，才能顯示附近餐廳。</p>}

          {location && (
            <>
              {errorMessage && (
                <p role="alert" className="error-banner">
                  {errorMessage}
                </p>
              )}

              {status === 'loading' && (
                <p role="status">
                  {showWakeup ? '正在喚醒伺服器，通常需要十幾秒到幾十秒，請稍候…' : '載入中…'}
                </p>
              )}

              {status === 'error' && !restaurants.length && (
                <div role="alert">
                  <p>載入餐廳資料失敗。</p>
                  <button type="button" onClick={loadRestaurants}>
                    重試
                  </button>
                </div>
              )}

              {candidatePlaceIds && (
                <div className="candidate-banner">
                  <p className="candidate-banner-text">
                    今天的候選（{displayedRestaurants.length} 家）
                    {restaurants.length < CANDIDATE_COUNT &&
                      `・目前這個分類只有 ${restaurants.length} 家`}
                  </p>
                  <div className="candidate-actions">
                    <button type="button" onClick={handleDrawCandidates}>
                      重新抽
                    </button>
                    <button type="button" onClick={handleShowAll}>
                      顯示全部
                    </button>
                  </div>
                </div>
              )}

              {status === 'ready' && displayedRestaurants.length === 0 && (
                <div className="empty-state">
                  <p>找不到符合條件的餐廳。</p>
                  {hasActiveFilters && (
                    <button type="button" className="clear-filters-button" onClick={handleClearFilters}>
                      清除篩選
                    </button>
                  )}
                </div>
              )}

              {displayedRestaurants.length > 0 && (
                <RestaurantList
                  restaurants={displayedRestaurants}
                  selectedPlaceId={selectedPlaceId}
                  onSelect={handleSelectRestaurant}
                  onOpenMaps={handleOpenMaps}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={handleToggleFavorite}
                />
              )}

              {status === 'ready' && resultMeta.hasMore && pages < MAX_PAGES && (
                <button
                  type='button'
                  className='load-more-button'
                  onClick={handleLoadMore}
                  disabled={status === 'loading'}
                >
                  載入更多（第 {pages + 1} 頁）
                </button>
              )}
            </>
          )}
        </div>

        <div className="map-column">
          {!location && <p className="empty-state">請先選擇地點，才能顯示地圖。</p>}

          {location && (
            <MapView
              restaurants={displayedRestaurants}
              center={{ lat: location.lat, lng: location.lng }}
              selectedPlaceId={selectedPlaceId}
              selectNonce={selectNonce}
              onSelectRestaurant={handleSelectRestaurant}
            />
          )}
        </div>
      </div>
    </main>
  )
}
