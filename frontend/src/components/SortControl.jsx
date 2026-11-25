import { MIN_RATING_OPTIONS, PRICE_LEVEL_OPTIONS } from '../urlState.js'

const MIN_RATING_LABELS = { 0: '不限', 3.5: '3.5 以上', 4: '4.0 以上', 4.5: '4.5 以上' }
const PRICE_LEVEL_LABELS = { 0: '免費', 1: '$ 便宜', 2: '$$ 中等', 3: '$$$ 昂貴', 4: '$$$$ 非常昂貴' }

export default function SortControl({ sort, onChange, minRating = 0, onMinRatingChange, priceLevel = '', onPriceLevelChange }) {
  return (
    <div className="sort-control">
      <label htmlFor="sort-select">排序</label>
      <select
        id="sort-select"
        aria-label="排序"
        value={sort}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">預設</option>
        <option value="rating">依星數（高到低）</option>
        <option value="distance">依距離（近到遠）</option>
        <option value="popular">依人氣（評論數多到少）</option>
      </select>
      <label htmlFor="price-level-filter-select">價位</label>
      <select
        id="price-level-filter-select"
        aria-label="價位"
        value={priceLevel === '' ? '' : String(priceLevel)}
        onChange={(e) => onPriceLevelChange(e.target.value === '' ? '' : Number(e.target.value))}
      >
        <option value="">不限</option>
        {PRICE_LEVEL_OPTIONS.map((value) => (
          <option key={value} value={String(value)}>
            {PRICE_LEVEL_LABELS[value]}
          </option>
        ))}
      </select>
      <label htmlFor="min-rating-select">最低評分</label>
      <select
        id="min-rating-select"
        aria-label="最低評分"
        value={String(minRating)}
        onChange={(e) => onMinRatingChange(Number(e.target.value))}
      >
        {MIN_RATING_OPTIONS.map((value) => (
          <option key={value} value={String(value)}>
            {MIN_RATING_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  )
}
