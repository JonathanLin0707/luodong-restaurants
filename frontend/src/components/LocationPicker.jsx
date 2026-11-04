import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadGoogleMaps } from '../mapsLoader.js'
import districts from '../data/taiwan-districts.json'

const MAX_SUGGESTIONS = 8

const COUNTY_SUFFIX = /[市縣]$/
const DISTRICT_SUFFIX = /[區鄉鎮市]$/

// 使用者常省略「市/縣」或混用「臺/台」，故去除空白、統一異體字後比對。
function normalize(str) {
  return str.replace(/\s+/g, '').replace(/臺/g, '台')
}

// 預先算好每個行政區的正規化欄位，以及去掉縣市/區鄉鎮尾字後的拼接字串
//（例如「台中市西屯區」→「台中西屯」），模組載入時算一次，避免每次 render 都重算全表。
const districtsWithMatchKey = districts.map((d) => ({
  ...d,
  nLabel: normalize(d.label),
  nCounty: normalize(d.county),
  nDistrict: normalize(d.district),
  matchKey: normalize(d.county.replace(COUNTY_SUFFIX, '') + d.district.replace(DISTRICT_SUFFIX, '')),
}))

function matchesQuery(district, normalizedMatchQuery) {
  return (
    district.nLabel.includes(normalizedMatchQuery) ||
    district.nCounty.includes(normalizedMatchQuery) ||
    district.nDistrict.includes(normalizedMatchQuery) ||
    district.matchKey.includes(normalizedMatchQuery)
  )
}

function searchDistricts(query) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []
  const normalizedMatchQuery = normalize(normalizedQuery)
  const matched = districtsWithMatchKey.filter((d) => matchesQuery(d, normalizedMatchQuery))
  matched.sort((a, b) => {
    const aTop = a.nLabel === normalizedMatchQuery || a.nLabel.startsWith(normalizedMatchQuery)
    const bTop = b.nLabel === normalizedMatchQuery || b.nLabel.startsWith(normalizedMatchQuery)
    if (aTop === bTop) return 0
    return aTop ? -1 : 1
  })
  return matched.slice(0, MAX_SUGGESTIONS)
}

export default function LocationPicker({ onLocationChange }) {
  const listboxId = useId()
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const elementRef = useRef(null)
  const [widgetReady, setWidgetReady] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoMessage, setGeoMessage] = useState('')

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const suggestions = useMemo(() => searchDistricts(query), [query])

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((mapsApi) => {
        if (cancelled || !containerRef.current || !mapsApi.places?.PlaceAutocompleteElement) return

        const element = new mapsApi.places.PlaceAutocompleteElement()
        element.id = 'google-location-search'
        element.className = 'location-search-input'
        // PlaceAutocompleteElement is a plain custom element, not a native labelable
        // form control, so <label htmlFor> alone won't associate with it for a11y tools.
        element.setAttribute('aria-label', '地點（Google 地址或地標搜尋）')
        try {
          element.setAttribute('placeholder', '搜尋地址或地標（例如：台北市信義區）')
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
      .catch(() => {
        // Google 載入失敗或額度用盡時，保持本地搜尋可用，不影響主要流程。
      })
    return () => {
      cancelled = true
      if (elementRef.current && containerRef.current?.contains(elementRef.current)) {
        containerRef.current.removeChild(elementRef.current)
      }
    }
  }, [onLocationChange])

  const selectDistrict = useCallback(
    (district) => {
      setQuery(district.label)
      setIsOpen(false)
      setActiveIndex(-1)
      onLocationChange({ lat: district.lat, lng: district.lng, label: district.label })
    },
    [onLocationChange],
  )

  const handleQueryChange = (event) => {
    const nextQuery = event.target.value
    setQuery(nextQuery)
    const nextSuggestions = searchDistricts(nextQuery)
    setIsOpen(nextSuggestions.length > 0)
    setActiveIndex(nextSuggestions.length > 0 ? 0 : -1)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true)
        setActiveIndex(0)
        return
      }
      if (suggestions.length === 0) return
      setActiveIndex((current) => (current + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (suggestions.length === 0) return
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (event.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault()
        selectDistrict(suggestions[activeIndex])
      }
      return
    }
    if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault()
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
  }

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
          <input
            ref={inputRef}
            id="location-search"
            type="text"
            className="location-search-input"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setIsOpen(false)}
            placeholder="輸入縣市或鄉鎮市區（例如：羅東、宜蘭、信義區）"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            autoComplete="off"
          />
          {isOpen && (
            <ul id={listboxId} role="listbox" className="location-listbox">
              {suggestions.map((district, index) => (
                <li
                  key={district.label}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={
                    index === activeIndex
                      ? 'location-option location-option-active'
                      : 'location-option'
                  }
                  // 在 onClick 之前觸發，避免 input 的 onBlur 先把下拉清單收起來。
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDistrict(district)}
                >
                  {district.label}
                </li>
              ))}
            </ul>
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
      <p className="location-data-attribution">
        地點資料 © 中華民國內政部（data.gov.tw），整理自 taiwan-atlas（MIT License）
      </p>
      <details className="google-search-details">
        <summary>用地址或地標搜尋（Google，選用）</summary>
        <div className="location-search-container google-search-container">
          <div ref={containerRef} style={{ display: widgetReady ? 'block' : 'none' }} />
          {!widgetReady && (
            <input
              type="text"
              aria-label="地點（Google 地址或地標搜尋）"
              className="location-search-input"
              placeholder="地點搜尋載入中…"
              disabled
            />
          )}
        </div>
      </details>
    </div>
  )
}
