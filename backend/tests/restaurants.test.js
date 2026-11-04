jest.mock('../src/placesClient');
jest.mock('../src/cache');

const request = require('supertest');
const placesClient = require('../src/placesClient');
const cache = require('../src/cache');

cache.load.mockReturnValue(null);

const app = require('../src/app');

const LUODONG = { lat: 24.6778, lng: 121.7684 };
const TAIPEI = { lat: 25.033, lng: 121.5654 };

function makePlace(id, name, types) {
  return {
    id,
    displayName: { text: name },
    rating: 4.0,
    userRatingCount: 10,
    formattedAddress: `addr-${id}`,
    location: { latitude: LUODONG.lat, longitude: LUODONG.lng },
    types,
  };
}

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/restaurants', () => {
  beforeEach(() => {
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('400s when lat is missing', async () => {
    const res = await request(app).get('/api/restaurants').query({ lng: LUODONG.lng });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('400s when lng is missing', async () => {
    const res = await request(app).get('/api/restaurants').query({ lat: LUODONG.lat });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('400s when lat is out of range', async () => {
    const res = await request(app).get('/api/restaurants').query({ lat: 999, lng: LUODONG.lng });
    expect(res.status).toBe(400);
  });

  it('400s when lng is non-numeric', async () => {
    const res = await request(app).get('/api/restaurants').query({ lat: LUODONG.lat, lng: 'abc' });
    expect(res.status).toBe(400);
  });

  it('clamps an out-of-range radius to the default instead of erroring', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue([makePlace('p1', '羅東夜市鹽酥雞', ['restaurant'])]);

    const res = await request(app)
      .get('/api/restaurants')
      .query({ lat: LUODONG.lat, lng: LUODONG.lng, radius: 999999 });

    expect(res.status).toBe(200);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledWith(
      expect.objectContaining({ radiusMeters: 4000 })
    );
  });

  it('builds mapsUrl with the official Maps URLs API format (query + query_place_id)', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue([makePlace('p1', '羅東夜市鹽酥雞', ['restaurant'])]);

    const res = await request(app).get('/api/restaurants').query(LUODONG);

    expect(res.status).toBe(200);
    expect(res.body[0].mapsUrl).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('羅東夜市鹽酥雞')}&query_place_id=p1`
    );
  });

  it('recomputes mapsUrl in the current format even when the disk cache stored an old-format value', async () => {
    const cacheKey = `${LUODONG.lat.toFixed(3)},${LUODONG.lng.toFixed(3)},4000`;
    app.__setCacheForTest({
      [cacheKey]: {
        updatedAt: new Date().toISOString(),
        restaurants: [
          {
            placeId: 'p1',
            name: '羅東夜市鹽酥雞',
            rating: 4.0,
            userRatingsTotal: 10,
            address: 'addr-p1',
            lat: LUODONG.lat,
            lng: LUODONG.lng,
            category: '小吃',
            mapsUrl: 'https://www.google.com/maps/place/?q=place_id:p1',
          },
        ],
      },
    });

    const res = await request(app).get('/api/restaurants').query(LUODONG);

    expect(res.status).toBe(200);
    expect(placesClient.fetchNearbyRestaurants).not.toHaveBeenCalled();
    expect(res.body[0].mapsUrl).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('羅東夜市鹽酥雞')}&query_place_id=p1`
    );
  });

  it('serves from cache on a second request within 24h for the same location, without re-calling the Places API', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue([makePlace('p1', '羅東夜市鹽酥雞', ['restaurant'])]);

    const first = await request(app).get('/api/restaurants').query(LUODONG);
    expect(first.status).toBe(200);
    expect(first.body).toHaveLength(1);

    const second = await request(app).get('/api/restaurants').query(LUODONG);
    expect(second.status).toBe(200);
    expect(second.body).toHaveLength(1);

    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('keeps independent caches for two different locations', async () => {
    placesClient.fetchNearbyRestaurants
      .mockResolvedValueOnce([makePlace('luodong-1', '羅東夜市鹽酥雞', ['restaurant'])])
      .mockResolvedValueOnce([makePlace('taipei-1', '稻荷食堂', ['japanese_restaurant'])]);

    const luodongRes = await request(app).get('/api/restaurants').query(LUODONG);
    const taipeiRes = await request(app).get('/api/restaurants').query(TAIPEI);

    expect(luodongRes.body.map((r) => r.placeId)).toEqual(['luodong-1']);
    expect(taipeiRes.body.map((r) => r.placeId)).toEqual(['taipei-1']);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(2);

    // Re-requesting Luodong again still hits its own fresh cache entry, not Taipei's.
    const luodongAgain = await request(app).get('/api/restaurants').query(LUODONG);
    expect(luodongAgain.body.map((r) => r.placeId)).toEqual(['luodong-1']);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(2);
  });

  it('refetches once the cached entry is older than 24h', async () => {
    const staleKey = `${LUODONG.lat.toFixed(3)},${LUODONG.lng.toFixed(3)},4000`;
    app.__setCacheForTest({
      [staleKey]: {
        restaurants: [makePlace('old', '舊資料', ['restaurant'])],
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
    });
    placesClient.fetchNearbyRestaurants.mockResolvedValue([makePlace('fresh', '新資料', ['restaurant'])]);

    const res = await request(app).get('/api/restaurants').query(LUODONG);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.placeId)).toEqual(['fresh']);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('returns a 502 when the Places API call fails', async () => {
    placesClient.fetchNearbyRestaurants.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/restaurants').query(LUODONG);
    expect(res.status).toBe(502);
  });

  it('filters by category and sorts by rating from the cached results', async () => {
    const staleKey = `${LUODONG.lat.toFixed(3)},${LUODONG.lng.toFixed(3)},4000`;
    app.__setCacheForTest({
      [staleKey]: {
        restaurants: [
          { placeId: '1', name: 'A', rating: 4.2, category: '日式' },
          { placeId: '2', name: 'B', rating: 4.8, category: '火鍋' },
          { placeId: '3', name: 'C', rating: 3.9, category: '日式' },
        ],
        updatedAt: new Date().toISOString(),
      },
    });

    const filtered = await request(app)
      .get('/api/restaurants')
      .query({ ...LUODONG, category: '火鍋' });
    expect(filtered.body.map((r) => r.placeId)).toEqual(['2']);

    const sorted = await request(app)
      .get('/api/restaurants')
      .query({ ...LUODONG, sort: 'rating' });
    expect(sorted.body.map((r) => r.placeId)).toEqual(['2', '1', '3']);

    expect(placesClient.fetchNearbyRestaurants).not.toHaveBeenCalled();
  });
});

describe('GET /api/categories', () => {
  beforeEach(() => {
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('400s when lat or lng is missing', async () => {
    const res = await request(app).get('/api/categories').query({ lat: LUODONG.lat });
    expect(res.status).toBe(400);
  });

  it('fetches and returns non-empty categories for a location that has never been queried (cold cache)', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue([
      makePlace('p1', '羅東夜市鹽酥雞', ['restaurant']),
      makePlace('p2', '稻荷食堂', ['japanese_restaurant']),
    ]);

    const res = await request(app).get('/api/categories').query(TAIPEI);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);

    const restaurantsRes = await request(app).get('/api/restaurants').query(TAIPEI);
    expect(new Set(res.body)).toEqual(new Set(restaurantsRes.body.map((r) => r.category)));
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('returns the unique categories cached for that location, sorted by CATEGORY_ORDER', async () => {
    const key = `${LUODONG.lat.toFixed(3)},${LUODONG.lng.toFixed(3)},4000`;
    app.__setCacheForTest({
      [key]: {
        restaurants: [
          { placeId: '1', category: '小吃' },
          { placeId: '2', category: '火鍋' },
          { placeId: '3', category: '日式' },
        ],
        updatedAt: new Date().toISOString(),
      },
    });

    const res = await request(app).get('/api/categories').query(LUODONG);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['日式', '火鍋', '小吃']);
    expect(placesClient.fetchNearbyRestaurants).not.toHaveBeenCalled();
  });

  it('does not call the Places API twice when restaurants and categories race for the same cold cacheKey', async () => {
    placesClient.fetchNearbyRestaurants.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([makePlace('p1', '羅東夜市鹽酥雞', ['restaurant'])]), 20);
        })
    );

    const [restaurantsRes, categoriesRes] = await Promise.all([
      request(app).get('/api/restaurants').query(TAIPEI),
      request(app).get('/api/categories').query(TAIPEI),
    ]);

    expect(restaurantsRes.status).toBe(200);
    expect(categoriesRes.status).toBe(200);
    expect(categoriesRes.body.length).toBeGreaterThan(0);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('returns a 502 when the Places API call fails on a cold cache', async () => {
    placesClient.fetchNearbyRestaurants.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/categories').query(LUODONG);
    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();
  });

  it('shares a single failed fetch between restaurants and categories, calling the Places API only once', async () => {
    placesClient.fetchNearbyRestaurants.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('boom')), 20);
        })
    );

    const [restaurantsRes, categoriesRes] = await Promise.all([
      request(app).get('/api/restaurants').query(TAIPEI),
      request(app).get('/api/categories').query(TAIPEI),
    ]);

    expect(restaurantsRes.status).toBe(502);
    expect(categoriesRes.status).toBe(502);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);

    // A later request for the same key can retry instead of staying stuck on the old failure.
    placesClient.fetchNearbyRestaurants.mockResolvedValue([makePlace('p1', '羅東夜市鹽酥雞', ['restaurant'])]);
    const retryRes = await request(app).get('/api/categories').query(TAIPEI);
    expect(retryRes.status).toBe(200);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/restaurants/refresh', () => {
  beforeEach(() => {
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('400s when lat or lng is missing', async () => {
    const res = await request(app).post('/api/restaurants/refresh').query({ lat: LUODONG.lat });
    expect(res.status).toBe(400);
  });

  it('refreshes the cache from the Places API and returns a count', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue([
      makePlace('place-1', '羅東夜市鹽酥雞', ['restaurant']),
      makePlace('place-2', '稻荷食堂', ['japanese_restaurant', 'restaurant']),
    ]);

    const res = await request(app).post('/api/restaurants/refresh').query(LUODONG);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(typeof res.body.updatedAt).toBe('string');
    expect(cache.save).toHaveBeenCalledTimes(1);

    const listRes = await request(app).get('/api/restaurants').query(LUODONG);
    expect(listRes.body).toHaveLength(2);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('ignores a fresh cache and forces a new Places API call', async () => {
    placesClient.fetchNearbyRestaurants
      .mockResolvedValueOnce([makePlace('first', '羅東夜市鹽酥雞', ['restaurant'])])
      .mockResolvedValueOnce([makePlace('second', '稻荷食堂', ['japanese_restaurant'])]);

    await request(app).post('/api/restaurants/refresh').query(LUODONG);
    const second = await request(app).post('/api/restaurants/refresh').query(LUODONG);

    expect(second.body.count).toBe(1);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when the Places API call fails', async () => {
    placesClient.fetchNearbyRestaurants.mockRejectedValue(new Error('boom'));

    const res = await request(app).post('/api/restaurants/refresh').query(LUODONG);
    expect(res.status).toBe(502);
  });
});
