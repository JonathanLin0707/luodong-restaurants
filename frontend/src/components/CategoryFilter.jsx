// 五個晶片（加上「全部」）對應後端既有的多值分類（逗號 OR）。
// 「其他」吃下所有細類，所以沒有任何餐廳會被藏起來。
export const CATEGORY_CHIPS = [
  { label: '全部', value: '' },
  { label: '早餐', value: '早餐' },
  { label: '小吃', value: '小吃' },
  { label: '火鍋', value: '火鍋' },
  { label: '咖啡甜點', value: '咖啡廳,甜點烘焙' },
  { label: '其他', value: '日式,自助餐,海鮮,熱炒,其他' },
]

export default function CategoryFilter({ selectedCategory, onChange }) {
  const current = selectedCategory || ''
  return (
    <div className="category-filter" role="group" aria-label="分類篩選">
      <span className="category-filter-label" aria-hidden="true">分類</span>
      <div className="category-chips">
        {CATEGORY_CHIPS.map((chip) => {
          const active = chip.value === current
          return (
            <button
              key={chip.label}
              type="button"
              className={active ? 'category-chip is-active' : 'category-chip'}
              aria-pressed={active}
              onClick={() => onChange(chip.value)}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
