import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import RestaurantList from './components/RestaurantList.jsx'
import CategoryFilter from './components/CategoryFilter.jsx'
import SortControl from './components/SortControl.jsx'
import LocationPicker from './components/LocationPicker.jsx'
import { fetchRestaurants, fetchCategories } from './api.js'

const CANDIDATE_COUNT = 5
const DEFAULT_RADIUS_METERS = 4000

function shuffleArray(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export default function App() {
  const [location, setLocation] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortByRating, setSortByRating] = useState(false)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedPlaceId, setSelectedPlaceId] = useState(null)
  const [selectNonce, setSelectNonce] = useState(0)
  const [candidatePlaceIds, setCandidatePlaceIds] = useState(null)

  useEffect(() => {
    if (!location) return
    fetchCategories({ lat: location.lat, lng: location.lng, radius: DEFAULT_RADIUS_METERS })
      .then(setCategories)
      .catch(() => {
        setCategories([])
      })
  }, [location])

  useEffect(() => {
    // 換地點後，若新地點的分類清單沒有原本選的分類，就自動回到全部分類。
    // categories 為空代表還在載入或載入失敗，這時保留使用者的選擇，不要清掉。
    if (categories.length === 0) return
    if (selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory('')
    }
  }, [categories, selectedCategory])

  const loadRestaurants = useCallback(async () => {
    if (!location) return
    setStatus('loading')
    setErrorMessage('')
    try {
      const data = await fetchRestaurants({
        category: selectedCategory || undefined,
        sort: sortByRating ? 'rating' : undefined,
        lat: location.lat,
        lng: location.lng,
        radius: DEFAULT_RADIUS_METERS,
      })
      setRestaurants(data)
      setStatus('ready')
    } catch (err) {
      setErrorMessage(err.message || '載入餐廳資料失敗')
      setStatus('error')
    }
  }, [location, selectedCategory, sortByRating])

  useEffect(() => {
    loadRestaurants()
  }, [loadRestaurants])

  useEffect(() => {
    setCandidatePlaceIds(null)
  }, [location, selectedCategory, sortByRating])

  const displayedRestaurants = useMemo(() => {
    if (!candidatePlaceIds) return restaurants
    return restaurants.filter((r) => candidatePlaceIds.includes(r.placeId))
  }, [restaurants, candidatePlaceIds])

  useEffect(() => {
    if (selectedPlaceId && !displayedRestaurants.some((r) => r.placeId === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [displayedRestaurants, selectedPlaceId])

  const handleLocationChange = useCallback((nextLocation) => {
    setLocation(nextLocation)
    setSelectedCategory('')
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

      <LocationPicker onLocationChange={handleLocationChange} />

      {location && (
        <div className="controls">
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onChange={setSelectedCategory}
          />
          <SortControl sortByRating={sortByRating} onToggle={setSortByRating} />
          <button
            type="button"
            className="draw-candidates-button"
            onClick={handleDrawCandidates}
            disabled={restaurants.length === 0}
          >
            抽 5 家 🎲
          </button>
        </div>
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

              {status === 'loading' && <p role="status">載入中…</p>}

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
                <p className="empty-state">找不到符合條件的餐廳。</p>
              )}

              {displayedRestaurants.length > 0 && (
                <RestaurantList
                  restaurants={displayedRestaurants}
                  selectedPlaceId={selectedPlaceId}
                  onSelect={handleSelectRestaurant}
                  onOpenMaps={handleOpenMaps}
                />
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
