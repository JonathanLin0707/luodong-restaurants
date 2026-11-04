export default function SortControl({ sortByRating, onToggle }) {
  return (
    <div className="sort-control">
      <label htmlFor="sort-by-rating">
        <input
          id="sort-by-rating"
          type="checkbox"
          checked={sortByRating}
          onChange={(e) => onToggle(e.target.checked)}
        />
        依星數排序（高到低）
      </label>
    </div>
  )
}
