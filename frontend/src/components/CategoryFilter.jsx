export default function CategoryFilter({ categories, selectedCategory, onChange }) {
  return (
    <div className="category-filter">
      <label htmlFor="category-select">分類篩選</label>
      <select
        id="category-select"
        value={selectedCategory}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">全部分類</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
  )
}
