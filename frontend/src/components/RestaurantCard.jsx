import { useEffect, useRef } from 'react'

const PRICE_LABELS = ['免費', '便宜', '中等', '昂貴', '非常昂貴']

function openStatusInfo(isOpenBasis, isOpen) {
  if (isOpenBasis === 'schedule') {
    return isOpen ? { text: '營業中', tooltip: '依營業時段判定', open: true }
                  : { text: '休息中', tooltip: '依營業時段判定', open: false }
  }
  if (isOpenBasis === 'snapshot') {
    return isOpen ? { text: '查詢時營業中', tooltip: '此為抓取時狀態，可能已過期', open: true }
                  : { text: '查詢時休息中', tooltip: '此為抓取時狀態，可能已過期', open: false }
  }
  return null
}

function formatPriceLevel(level) {
  if (level === 0) return '免費'
  if (level >= 1 && level <= 4) return '$'.repeat(level)
  return null
}

function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return null
  const whole = Math.floor(meters)
  if (whole < 1000) return `${whole} m`
  return `${(Math.floor(meters / 100) / 10).toFixed(1)} km`
}

export default function RestaurantCard({ restaurant, isSelected, onSelect, onOpenMaps }) {
  const { name, rating, userRatingsTotal, address, category, isOpen, isOpenBasis, priceLevel, distanceMeters } = restaurant
  const roundedStars = rating != null ? Math.round(rating) : 0
  const cardRef = useRef(null)

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  function handleActivate() {
    onSelect(restaurant)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleActivate()
    }
  }

  function handleOpenMapsClick(e) {
    e.stopPropagation()
    onOpenMaps(restaurant)
  }

  const status = openStatusInfo(isOpenBasis, isOpen)
  const priceText = formatPriceLevel(priceLevel)
  const distanceText = formatDistance(distanceMeters)

  return (
    <li ref={cardRef} className={`restaurant-card${isSelected ? ' restaurant-card-selected' : ''}`}>
      <div
        className="restaurant-card-main"
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        aria-pressed={isSelected}
        aria-label={`在地圖上顯示 ${name} 的位置`}
      >
        <h3 className="restaurant-name">{name}</h3>
        <p className="restaurant-rating">
          {rating != null ? (
            <>
              <span aria-hidden="true">
                {'★'.repeat(roundedStars)}
                {'☆'.repeat(5 - roundedStars)}
              </span>
              <span className="rating-number"> {rating.toFixed(1)}</span>
            </>
          ) : (
            <span>尚無評分</span>
          )}
          <span className="rating-count">
            {userRatingsTotal != null ? ` (${userRatingsTotal} 則評論)` : ' (尚無評論)'}
          </span>
        </p>
        <p className="restaurant-address">{address}</p>
        <span className="category-tag">{category}</span>

        <div className="restaurant-meta">
          {status && (
            <span
              className={`open-status ${status.open ? 'open-status-open' : 'open-status-closed'}`}
              title={status.tooltip}
            >
              {status.text}
            </span>
          )}
          {priceText && (
            <span className="price-level" aria-label={`價位：${PRICE_LABELS[priceLevel]}`}>
              {priceText}
            </span>
          )}
          {distanceText && (
            <span className="distance" title="距搜尋位置">
              {distanceText}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="open-maps-link"
        onClick={handleOpenMapsClick}
        aria-label={`在 Google 地圖開啟 ${name}`}
      >
        開啟地圖 ↗
      </button>
    </li>
  )
}
