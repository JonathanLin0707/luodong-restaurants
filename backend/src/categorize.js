const CATEGORY_RULES = [
  { category: '日式', keywords: ['日式', '壽司', '寿司', '拉麵', '拉面', '居酒屋', '燒肉', '和食', '丼', '定食', '日本料理', '鐵板燒', '鉄板'] },
  { category: '火鍋', keywords: ['火鍋', '麻辣', '鍋物', '涮涮鍋', '石頭火鍋', '鴛鴦鍋'] },
  { category: '咖啡廳', keywords: ['咖啡', 'café', 'cafe', 'coffee'] },
  { category: '甜點烘焙', keywords: ['甜點', '烘焙', '麵包', '蛋糕', 'bakery', 'dessert', '手作坊'] },
  { category: '早餐', keywords: ['早餐', '早午餐', 'brunch'] },
  { category: '自助餐', keywords: ['自助餐', '吃到飽', 'buffet'] },
  { category: '海鮮', keywords: ['海鮮', '活海鮮', '龍蝦', '螃蟹', '魚店', '魚市'] },
  { category: '熱炒', keywords: ['熱炒', '快炒', '台菜', '炒飯', '合菜'] },
  { category: '小吃', keywords: ['小吃', '麵店', '米粉', '肉圓', '蚵仔煎', '滷味', '鹽酥雞', '雞排', '夜市', '小吃部'] },
];

const FALLBACK_CATEGORY = '其他';

// Second-layer signal: Google Places API (New) "types" values (see Table A in the
// Places API (New) docs) that map reasonably onto our fixed Taiwanese-cuisine
// category set. Only types that actually exist in the API are listed here —
// categories with no matching official type (e.g. 火鍋, which Google has no
// dedicated "hot pot" type for) are intentionally left to the keyword layer only.
const TYPE_CATEGORY_RULES = [
  { category: '日式', types: ['japanese_restaurant', 'sushi_restaurant', 'ramen_restaurant'] },
  { category: '咖啡廳', types: ['cafe', 'coffee_shop', 'cat_cafe', 'dog_cafe', 'tea_house'] },
  { category: '海鮮', types: ['seafood_restaurant'] },
  { category: '自助餐', types: ['buffet_restaurant', 'cafeteria', 'food_court'] },
  { category: '早餐', types: ['breakfast_restaurant', 'brunch_restaurant'] },
  {
    category: '甜點烘焙',
    types: [
      'bakery',
      'dessert_restaurant',
      'dessert_shop',
      'ice_cream_shop',
      'donut_shop',
      'chocolate_shop',
      'chocolate_factory',
      'candy_store',
      'confectionery',
      'acai_shop',
      'bagel_shop',
      'juice_shop',
    ],
  },
  // Taiwan's "熱炒" (stir-fry + beer eatery) has no exact Google equivalent;
  // bar/pub/grill types are the closest approximation per the brief.
  { category: '熱炒', types: ['bar_and_grill', 'bar', 'pub', 'wine_bar'] },
  {
    category: '小吃',
    types: [
      'fast_food_restaurant',
      'meal_takeaway',
      'meal_delivery',
      'hamburger_restaurant',
      'sandwich_shop',
      'pizza_restaurant',
      'diner',
      'deli',
    ],
  },
];

const TYPE_TO_CATEGORY = new Map();
for (const rule of TYPE_CATEGORY_RULES) {
  for (const type of rule.types) {
    TYPE_TO_CATEGORY.set(type, rule.category);
  }
}

function categorizeByKeyword(name) {
  const normalized = (name || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return rule.category;
    }
  }
  return null;
}

function categorizeByTypes(types) {
  if (!Array.isArray(types)) return null;
  for (const type of types) {
    const category = TYPE_TO_CATEGORY.get(type);
    if (category) return category;
  }
  return null;
}

// Layer 1:店名關鍵字比對。Layer 2: 比對不到時，用 Google 回傳的 types 陣列輔助判斷。
// 兩層都比對不到才歸類「其他」。
function categorize(name, types) {
  return categorizeByKeyword(name) || categorizeByTypes(types) || FALLBACK_CATEGORY;
}

const CATEGORY_ORDER = [...CATEGORY_RULES.map((r) => r.category), FALLBACK_CATEGORY];

module.exports = { categorize, categorizeByKeyword, categorizeByTypes, CATEGORY_ORDER };
