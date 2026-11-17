jest.mock('../src/placesClient');
jest.mock('../src/cache');

const request = require('supertest');
const placesClient = require('../src/placesClient');
const cache = require('../src/cache');

cache.load.mockReturnValue(null);

const app = require('../src/app');

const LUODONG = { lat: 24.6778, lng: 121.7684 };

function makePlace(id, name, types, extra) {
  return Object.assign({
    id,
    displayName: { text: name },
    rating: 4.0,
    userRatingCount: 10,
    formattedAddress: `addr-${id}`,
    location: { latitude: LUODONG.lat, longitude: LUODONG.lng },
    types: types || ['restaurant'],
  }, extra || {});
}

describe('batch1 improvements', () => {
  beforeEach(() => {
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('adds integer distanceMeters computed from request center', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [makePlace('p1', '店', ['restaurant'])],
      nextPageToken: undefined,
    });
    const res = await request(app).get('/api/restaurants').query(LUODONG);
    const r = res.body.restaurants[0];
    expect(typeof r.distanceMeters).toBe('number');
    expect(Number.isInteger(r.distanceMeters)).toBe(true);
  });

  it('treats cache entries without schemaVersion as stale', async () => {
    const key = `${LUODONG.lat.toFixed(3)},${LUODONG.lng.toFixed(3)},4000`;
    app.__setCacheForTest({
      [key]: {
        restaurants: [{ placeId: 'old', name: '舊', rating: 4, category: '其他', lat: LUODONG.lat, lng: LUODONG.lng }],
        updatedAt: new Date().toISOString(),
      },
    });
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [makePlace('fresh', '新', ['restaurant'])],
      nextPageToken: undefined,
    });
    const res = await request(app).get('/api/restaurants').query(LUODONG);
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['fresh']);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('pages=1 makes a single Places call', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [makePlace('p1', '店', ['restaurant'])],
      nextPageToken: 't',
    });
    const res = await request(app).get('/api/restaurants').query({ ...LUODONG, pages: 1 });
    expect(res.body.restaurants).toHaveLength(1);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });

  it('pages=3 fetches up to 3 pages and returns more than 20', async () => {
    placesClient.fetchNearbyRestaurants
      .mockResolvedValueOnce({ places: Array.from({ length: 20 }, (_, i) => makePlace(`a${i}`, '店A', ['restaurant'])), nextPageToken: 't1' })
      .mockResolvedValueOnce({ places: Array.from({ length: 20 }, (_, i) => makePlace(`b${i}`, '店B', ['restaurant'])), nextPageToken: 't2' })
      .mockResolvedValueOnce({ places: Array.from({ length: 20 }, (_, i) => makePlace(`c${i}`, '店C', ['restaurant'])), nextPageToken: undefined });
    const res = await request(app).get('/api/restaurants').query({ ...LUODONG, pages: 3 });
    expect(res.body.restaurants.length).toBe(60);
    expect(res.body.returnedCount).toBe(60);
    expect(res.body.hasMore).toBe(false);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(3);
  });

  it('maps isOpen and priceLevel', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [makePlace('p1', '店', ['restaurant'], {
        currentOpeningHours: { openNow: true },
        priceLevel: 'PRICE_LEVEL_MODERATE',
      })],
      nextPageToken: undefined,
    });
    const res = await request(app).get('/api/restaurants').query(LUODONG);
    const r = res.body.restaurants[0];
    expect(r.isOpen).toBe(true);
    expect(r.priceLevel).toBe(2);
  });

  it('enforces a 5-minute refresh cooldown per IP (429), bypassable with REFRESH_TOKEN', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [makePlace('p1', '店', ['restaurant'])],
      nextPageToken: undefined,
    });
    const first = await request(app).post('/api/restaurants/refresh').query(LUODONG);
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/restaurants/refresh').query(LUODONG);
    expect(second.status).toBe(429);

    process.env.REFRESH_TOKEN = 'secret';
    const third = await request(app).post('/api/restaurants/refresh').query(LUODONG).set('X-Refresh-Token', 'secret');
    expect(third.status).toBe(200);
    delete process.env.REFRESH_TOKEN;
  });
});

