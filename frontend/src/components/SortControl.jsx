import { MIN_RATING_OPTIONS } from '../urlState.js'

const MIN_RATING_LABELS = { 0: '不限', 3.5: '3.5 以上', 4: '4.0 以上', 4.5: '4.5 以上' }

export default function SortControl({ sort, onChange, minRating = 0, onMinRatingChange }) {
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
