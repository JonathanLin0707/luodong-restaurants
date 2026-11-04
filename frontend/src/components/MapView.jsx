import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../mapsLoader.js'

const BOUNCE_DURATION_MS = 1400

export default function MapView({ restaurants, center, selectedPlaceId, selectNonce, onSelectRestaurant }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const mapsApiRef = useRef(null)
  const markersRef = useRef([])
  const infoWindowRef = useRef(null)
  const bounceTimeoutRef = useRef(null)
  const initialCenterRef = useRef(center)
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((mapsApi) => {
        if (cancelled) return
        mapsApiRef.current = mapsApi
        mapRef.current = new mapsApi.Map(containerRef.current, {
          center: initialCenterRef.current,
          zoom: 14,
        })
        infoWindowRef.current = new mapsApi.InfoWindow()
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
      if (bounceTimeoutRef.current) clearTimeout(bounceTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map || !center) return
    map.setCenter(center)
    // Recenter immediately on a new location, independent of the restaurant list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng, status])

  useEffect(() => {
    const mapsApi = mapsApiRef.current
    const map = mapRef.current
    if (status !== 'ready' || !mapsApi || !map) return

    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = restaurants.map((restaurant) => {
      const marker = new mapsApi.Marker({
        position: { lat: restaurant.lat, lng: restaurant.lng },
        map,
        title: restaurant.name,
      })
      marker.placeId = restaurant.placeId
      marker.addListener('click', () => onSelectRestaurant(restaurant))
      return marker
    })

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null))
    }
  }, [restaurants, status, onSelectRestaurant])

  useEffect(() => {
    const mapsApi = mapsApiRef.current
    const map = mapRef.current
    const infoWindow = infoWindowRef.current
    if (status !== 'ready' || !mapsApi || !map) return

    if (bounceTimeoutRef.current) {
      clearTimeout(bounceTimeoutRef.current)
      bounceTimeoutRef.current = null
    }

    if (!selectedPlaceId) {
      if (infoWindow) infoWindow.close()
      return
    }

    const marker = markersRef.current.find((m) => m.placeId === selectedPlaceId)
    const restaurant = restaurants.find((r) => r.placeId === selectedPlaceId)
    if (!marker || !restaurant) return

    map.panTo({ lat: restaurant.lat, lng: restaurant.lng })
    marker.setAnimation(mapsApi.Animation.BOUNCE)
    bounceTimeoutRef.current = setTimeout(() => {
      marker.setAnimation(null)
    }, BOUNCE_DURATION_MS)

    if (infoWindow) {
      const ratingText =
        restaurant.rating != null ? `★ ${restaurant.rating.toFixed(1)}` : '尚無評分'
      infoWindow.setContent(`<strong>${restaurant.name}</strong><br/>${ratingText}`)
      infoWindow.open(map, marker)
    }
  }, [selectedPlaceId, selectNonce, status, restaurants])

  return (
    <section className="map-section" aria-label="餐廳地圖">
      <div ref={containerRef} className="map-container" data-testid="map-container" />
      {status === 'loading' && <p role="status">地圖載入中…</p>}
      {status === 'error' && <p role="alert">地圖載入失敗，請稍後再試，清單仍可正常使用。</p>}
    </section>
  )
}
