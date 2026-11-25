jest.mock('../src/placesClient');
jest.mock('../src/cache');

const request = require('supertest');
const placesClient = require('../src/placesClient');
const cache = require('../src/cache');

cache.load.mockReturnValue(null);

const app = require('../src/app');

const LUODONG = { lat: 24.6778, lng: 121.7684 };
const CACHE_KEY = `${LUODONG.lat.toFixed(3)},${LUODONG.lng.toFixed(3)},1000`;

function seed(restaurants) {
  app.__setCacheForTest({
    [CACHE_KEY]: {
      restaurants,
      updatedAt: new Date().toISOString(),
      schemaVersion: app.SCHEMA_VERSION,
    },
  });
}

function makeRestaurant(placeId, overrides = {}) {
  return {
    placeId,
    name: placeId,
    rating: 4.2,
    userRatingsTotal: 10,
    category: '小吃',
    priceLevel: null,
    lat: LUODONG.lat,
    lng: LUODONG.lng,
    ...overrides,
  };
}

function query(params) {
  return request(app).get('/api/restaurants').query({ ...LUODONG, ...params });
}

describe('GET /api/restaurants - 價位篩選與人氣排序', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('priceLevel=2 只回價位 2 的店，沒有價位資料的店被排除', async () => {
    seed([
      makeRestaurant('cheap', { priceLevel: 1 }),
      makeRestaurant('mid', { priceLevel: 2 }),
      makeRestaurant('no-price', { priceLevel: null }),
    ]);

    const res = await query({ priceLevel: 2 });

    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['mid']);
    expect(res.body.count).toBe(1);
  });

  it('priceLevel=0 視為免費，不會被當成不限而漏掉', async () => {
    seed([
      makeRestaurant('free', { priceLevel: 0 }),
      makeRestaurant('paid', { priceLevel: 1 }),
    ]);

    const res = await query({ priceLevel: 0 });

    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['free']);
  });

  it('priceLevel 逗號多值用 OR 篩選', async () => {
    seed([
      makeRestaurant('cheap', { priceLevel: 1 }),
      makeRestaurant('mid', { priceLevel: 2 }),
      makeRestaurant('expensive', { priceLevel: 4 }),
    ]);

    const res = await query({ priceLevel: '1,4' });

    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['cheap', 'expensive']);
  });

  it.each(['abc', '5', '-1', '2.5', ''])('不合法的 priceLevel %s 當成不限', async (value) => {
    seed([
      makeRestaurant('cheap', { priceLevel: 1 }),
      makeRestaurant('mid', { priceLevel: 2 }),
    ]);

    const res = await query({ priceLevel: value });

    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(2);
  });

  it('價位篩選發生在快取之後，不進快取鍵、不重打 Google API', async () => {
    seed([
      makeRestaurant('cheap', { priceLevel: 1 }),
      makeRestaurant('mid', { priceLevel: 2 }),
    ]);

    const first = await query({ priceLevel: 1 });
    const second = await query({ priceLevel: 2 });

    expect(first.body.restaurants.map((r) => r.placeId)).toEqual(['cheap']);
    expect(second.body.restaurants.map((r) => r.placeId)).toEqual(['mid']);
    expect(placesClient.fetchNearbyRestaurants).not.toHaveBeenCalled();
  });

  it('sort=popular 依評論數多到少排序', async () => {
    seed([
      makeRestaurant('few', { userRatingsTotal: 5 }),
      makeRestaurant('many', { userRatingsTotal: 500 }),
      makeRestaurant('some', { userRatingsTotal: 80 }),
    ]);

    const res = await query({ sort: 'popular' });

    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['many', 'some', 'few']);
  });

  it('sort=popular 評論數相同時比評分，沒有評論數的排在最後', async () => {
    seed([
      makeRestaurant('no-count', { userRatingsTotal: null, rating: 5.0 }),
      makeRestaurant('low-rating', { userRatingsTotal: 50, rating: 3.5 }),
      makeRestaurant('high-rating', { userRatingsTotal: 50, rating: 4.8 }),
    ]);

    const res = await query({ sort: 'popular' });

    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['high-rating', 'low-rating', 'no-count']);
  });

  it('價位篩選與人氣排序可以同時使用', async () => {
    seed([
      makeRestaurant('mid-few', { priceLevel: 2, userRatingsTotal: 5 }),
      makeRestaurant('mid-many', { priceLevel: 2, userRatingsTotal: 200 }),
      makeRestaurant('cheap-many', { priceLevel: 1, userRatingsTotal: 999 }),
    ]);

    const res = await query({ priceLevel: 2, sort: 'popular' });

    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['mid-many', 'mid-few']);
  });
});
