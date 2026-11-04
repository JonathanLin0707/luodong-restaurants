import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../mapsLoader.js'

export default function LocationPicker({ onLocationChange }) {
  const containerRef = useRef(null)
  const elementRef = useRef(null)
  const [widgetReady, setWidgetReady] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoMessage, setGeoMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((mapsApi) => {
        if (cancelled || !containerRef.current || !mapsApi.places?.PlaceAutocompleteElement) return

        const element = new mapsApi.places.PlaceAutocompleteElement()
        element.id = 'location-search'
        element.className = 'location-search-input'
        // PlaceAutocompleteElement is a plain custom element, not a native labelable
        // form control, so <label htmlFor> alone won't associate with it for a11y tools.
        element.setAttribute('aria-label', '地點')
        try {
          element.setAttribute('placeholder', '搜尋地點（例如：台北市信義區）')
        } catch {
          // older/newer API revisions may not support the placeholder attribute; cosmetic only
        }

        element.addEventListener('gmp-select', async (event) => {
          try {
            const place = event.placePrediction?.toPlace()
            if (!place) return
            await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] })
            const location = place.location
            if (!location) return
            const lat = typeof location.lat === 'function' ? location.lat() : location.lat
            const lng = typeof location.lng === 'function' ? location.lng() : location.lng
            onLocationChange({
              lat,
              lng,
              label: place.formattedAddress || place.displayName || '',
            })
          } catch {
            // ignore selections we can't resolve to a usable location; keep previous one
          }
        })

        elementRef.current = element
        containerRef.current.appendChild(element)
        setWidgetReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (elementRef.current && containerRef.current?.contains(elementRef.current)) {
        containerRef.current.removeChild(elementRef.current)
      }
    }
  }, [onLocationChange])

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoMessage('此裝置不支援定位功能，請改用搜尋欄位輸入地點。')
      return
    }
    setGeoMessage('')
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoLoading(false)
        onLocationChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: '目前位置',
        })
      },
      () => {
        setGeoLoading(false)
        setGeoMessage('無法取得目前位置，請改用搜尋欄位輸入地點。')
      },
    )
  }

  return (
    <div className="location-picker">
      <label htmlFor="location-search">地點</label>
      <div className="location-picker-row">
        <div className="location-search-container">
          <div ref={containerRef} style={{ display: widgetReady ? 'block' : 'none' }} />
          {!widgetReady && (
            <input
              type="text"
              aria-label="地點"
              className="location-search-input"
              placeholder="地點搜尋載入中…"
              disabled
            />
          )}
        </div>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={geoLoading}
          className="use-current-location-button"
        >
          使用目前位置
        </button>
      </div>
      {geoMessage && (
        <p role="alert" className="location-geo-error">
          {geoMessage}
        </p>
      )}
    </div>
  )
}
