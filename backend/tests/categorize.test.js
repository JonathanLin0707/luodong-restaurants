const { categorize } = require('../src/categorize');

describe('categorize (keyword layer only, no types)', () => {
  it.each([
    ['一心日式料理', '日式'],
    ['阿爸火鍋店', '火鍋'],
    ['小鎮咖啡', '咖啡廳'],
    ['甜點烘焙坊', '甜點烘焙'],
    ['活力早餐店', '早餐'],
    ['吃到飽自助餐', '自助餐'],
    ['活海鮮餐廳', '海鮮'],
    ['廟口熱炒', '熱炒'],
    ['羅東夜市鹽酥雞', '小吃'],
    ['無法分類的店名ＸＹＺ', '其他'],
  ])('classifies "%s" as %s', (name, expected) => {
    expect(categorize(name)).toBe(expected);
  });
});

describe('categorize (keyword misses, falls back to Google types)', () => {
  it.each([
    ['稻荷食堂', ['japanese_restaurant', 'restaurant'], '日式'],
    ['稻荷食堂', ['sushi_restaurant'], '日式'],
    ['飲廊', ['cafe', 'point_of_interest'], '咖啡廳'],
    ['飲廊', ['coffee_shop'], '咖啡廳'],
    ['海之家', ['seafood_restaurant'], '海鮮'],
    ['吃好吃好', ['buffet_restaurant'], '自助餐'],
    ['吃好吃好', ['food_court'], '自助餐'],
    ['早起的鳥', ['breakfast_restaurant'], '早餐'],
    ['早起的鳥', ['brunch_restaurant'], '早餐'],
    ['甜甜小舖', ['bakery'], '甜點烘焙'],
    ['甜甜小舖', ['dessert_shop'], '甜點烘焙'],
    ['角落', ['bar_and_grill'], '熱炒'],
    ['角落', ['pub'], '熱炒'],
    ['快食堂', ['fast_food_restaurant'], '小吃'],
    ['快食堂', ['sandwich_shop'], '小吃'],
  ])('when name "%s" has no keyword match, types %j -> %s', (name, types, expected) => {
    expect(categorize(name, types)).toBe(expected);
  });

  it('prefers the keyword match over types when both would match', () => {
    // Name contains the 咖啡 keyword but Google types it as a bakery —
    // layer 1 (keyword) must win.
    expect(categorize('小鎮咖啡', ['bakery'])).toBe('咖啡廳');
  });
});

describe('categorize (neither keyword nor types match -> 其他)', () => {
  it.each([
    ['無法分類的店名ＸＹＺ', undefined],
    ['無法分類的店名ＸＹＺ', []],
    ['無法分類的店名ＸＹＺ', ['restaurant', 'point_of_interest', 'establishment']],
    ['無法分類的店名ＸＹＺ', ['thai_restaurant']],
  ])('name "%s" with types %j falls back to 其他', (name, types) => {
    expect(categorize(name, types)).toBe('其他');
  });
});
