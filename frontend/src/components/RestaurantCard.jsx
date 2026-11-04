import { useEffect, useRef } from 'react'

export default function RestaurantCard({ restaurant, isSelected, onSelect, onOpenMaps }) {
  const { name, rating, userRatingsTotal, address, category } = restaurant
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
