export default function SortControl({ sort, onChange }) {
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
    </div>
  )
}
