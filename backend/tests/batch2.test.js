jest.mock('../src/placesClient');
jest.mock('../src/cache');

const request = require('supertest');
const placesClient = require('../src/placesClient');
const cache = require('../src/cache');

cache.load.mockReturnValue(null);
cache.save.mockImplementation(() => {});

const app = require('../src/app');
const { compactOpeningPeriods, isOpenAt, resolveOpenStatus } = require('../src/openingHours');

const CENTER = { lat: 24.6778, lng: 121.7684 };
const SCHEMA_VERSION = app.SCHEMA_VERSION;

// Fixed instants in Asia/Taipei (+8): expressed as UTC so the test states the
// local wall-clock time in a comment.
const SAT_2300 = Date.UTC(2026, 0, 10, 15, 0); // Sat 23:00
const SAT_2100 = Date.UTC(2026, 0, 10, 13, 0); // Sat 21:00
const SUN_0100 = Date.UTC(2026, 0, 10, 17, 0); // Sat 25:00 => Sun 01:00
const SUN_2100 = Date.UTC(2026, 0, 11, 13, 0); // Sun 21:00
const MON_0200 = Date.UTC(2026, 0, 11, 18, 0); // Mon 02:00
const MON_0400 = Date.UTC(2026, 0, 11, 20, 0); // Mon 04:00
const TUE_1530 = Date.UTC(2026, 0, 13, 7, 30); // Tue 15:30


function restaurant(id, extra) {
  return Object.assign(
    {
      placeId: id,
      name: `店${id}`,
      rating: 4.0,
      userRatingsTotal: 10,
      address: `addr-${id}`,
      lat: CENTER.lat,
      lng: CENTER.lng,
      category: '其他',
      isOpen: null,
      priceLevel: null,
    },
    extra || {}
  );
}

function seed(restaurants, hasMore) {
  const key = `${CENTER.lat.toFixed(3)},${CENTER.lng.toFixed(3)},1000`;
  app.__setCacheForTest({
    [key]: { restaurants, updatedAt: new Date(TUE_1530).toISOString(), schemaVersion: SCHEMA_VERSION, hasMore: Boolean(hasMore) },
  });
  return key;
}

function makePlace(id, extra) {
  return Object.assign(
    {
      id,
      displayName: { text: `店${id}` },
      rating: 4.0,
      userRatingCount: 10,
      formattedAddress: `addr-${id}`,
      location: { latitude: CENTER.lat, longitude: CENTER.lng },
      types: ['restaurant'],
    },
    extra || {}
  );
}

afterEach(() => {
  jest.useRealTimers();
});

describe('opening periods: compact + request-time schedule', () => {
  it('keeps only day/hour/minute and normalises enum day strings', () => {
    const compacted = compactOpeningPeriods({
      openNow: true,
      periods: [
        { open: { day: 'DAY_3_WEDNESDAY', hour: 11, minute: 30 }, close: { day: 3, hour: 21, minute: 0 } },
        { open: { day: 4, hour: 0, minute: 0 } },
        { open: { day: 9, hour: 1 }, close: { day: 9, hour: 2 } },
      ],
    });
    expect(compacted).toEqual([
      { open: { day: 3, hour: 11, minute: 30 }, close: { day: 3, hour: 21, minute: 0 } },
      { open: { day: 4, hour: 0, minute: 0 }, close: null },
    ]);
  });

  it('returns null when there are no periods (snapshot fallback) and [] when never open', () => {
    expect(compactOpeningPeriods({ openNow: true })).toBeNull();
    expect(compactOpeningPeriods(null)).toBeNull();
    expect(compactOpeningPeriods({ periods: [] })).toEqual([]);
  });

  it('boundary: hours crossing midnight (Fri/Sat style 22:00-02:00)', () => {
    const periods = [{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }];
    expect(isOpenAt(periods, SAT_2300)).toBe(true);
    expect(isOpenAt(periods, SAT_2100)).toBe(false);
    expect(isOpenAt(periods, SUN_0100)).toBe(true);
  });

  it('boundary: Sunday schedule rolling into Monday', () => {
    const periods = [{ open: { day: 0, hour: 20, minute: 0 }, close: { day: 1, hour: 3, minute: 0 } }];
    expect(isOpenAt(periods, SUN_2100)).toBe(true);
    expect(isOpenAt(periods, MON_0200)).toBe(true);
    expect(isOpenAt(periods, MON_0400)).toBe(false);
  });

  it('boundary: always open (open only, no close)', () => {
    const periods = [{ open: { day: 2, hour: 0, minute: 0 }, close: null }];
    expect(isOpenAt(periods, TUE_1530)).toBe(true);
    expect(isOpenAt(periods, MON_0200)).toBe(false);
    const fullWeek = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 0, minute: 0 }, close: null }));
    expect(isOpenAt(fullWeek, MON_0400)).toBe(true);
    expect(isOpenAt(fullWeek, SUN_0100)).toBe(true);
  });

  it('boundary: empty periods means never open, and is still reported as schedule', () => {
    expect(isOpenAt([], TUE_1530)).toBe(false);
    expect(resolveOpenStatus({ openingPeriods: [], isOpen: true }, TUE_1530)).toEqual({
      isOpen: false,
      isOpenBasis: 'schedule',
    });
  });

  it('falls back to the cached snapshot, then to null', () => {
    expect(resolveOpenStatus({ isOpen: true }, TUE_1530)).toEqual({ isOpen: true, isOpenBasis: 'snapshot' });
    expect(resolveOpenStatus({ isOpen: false }, TUE_1530)).toEqual({ isOpen: false, isOpenBasis: 'snapshot' });
    expect(resolveOpenStatus({ isOpen: null }, TUE_1530)).toEqual({ isOpen: null, isOpenBasis: null });
    expect(resolveOpenStatus({}, TUE_1530)).toEqual({ isOpen: null, isOpenBasis: null });
  });

  it('an overnight cache entry is re-evaluated at request time, not frozen', () => {
    // Cached at 23:00 Sat with the snapshot saying closed, periods say it opens 11:00-21:00 Mon-Fri.
    const periods = [1, 2, 3, 4].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 21, minute: 0 } }));
    const stale = Date.UTC(2026, 0, 10, 15, 0);
    expect(isOpenAt(periods, stale)).toBe(false);
    expect(resolveOpenStatus({ openingPeriods: periods, isOpen: false }, TUE_1530)).toEqual({
      isOpen: true,
      isOpenBasis: 'schedule',
    });
  });
});

describe('GET /api/restaurants: openNow filter and sort=distance', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(TUE_1530));
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('recomputes open status from periods and reports isOpenBasis=schedule', async () => {
    const weekday11to21 = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 21, minute: 0 } }));
    seed([restaurant('open', { openingPeriods: weekday11to21, isOpen: false })]);
    const res = await request(app).get('/api/restaurants').query(CENTER);
    expect(res.body.restaurants[0].isOpen).toBe(true);
    expect(res.body.restaurants[0].isOpenBasis).toBe('schedule');
  });

  it('openNow=1 keeps only isOpen===true and reports counts for the filtered set', async () => {
    const weekday11to21 = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 21, minute: 0 } }));
    seed([
      restaurant('open', { openingPeriods: weekday11to21 }),
      restaurant('closed', { openingPeriods: [{ open: { day: 3, hour: 1, minute: 0 }, close: { day: 3, hour: 2, minute: 0 } }] }),
      restaurant('unknown', { openingPeriods: null, isOpen: null }),
      restaurant('nosnap', {}),
    ]);
    const res = await request(app).get('/api/restaurants').query({ ...CENTER, openNow: 1 });
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['open']);
    expect(res.body.returnedCount).toBe(1);
    expect(res.body.count).toBe(1);
  });

  it('treats only 1 and true as enabled, and every other value as absent', async () => {
    const all = [restaurant('a', { isOpen: true }), restaurant('b', { isOpen: false })];
    for (const value of ['1', 'true', 'TRUE']) {
      seed(all);
      const on = await request(app).get('/api/restaurants').query({ ...CENTER, openNow: value });
      expect(on.body.restaurants.map((r) => r.placeId)).toEqual(['a']);
    }
    for (const value of ['0', 'false', 'yes', 'openNow', '']) {
      seed(all);
      const off = await request(app).get('/api/restaurants').query({ ...CENTER, openNow: value });
      expect(off.body.restaurants.map((r) => r.placeId)).toEqual(['a', 'b']);
    }
  });

  it('an all-closed filter yields an empty list with hasMore false', async () => {
    seed([restaurant('closed', { isOpen: false })], true);
    const res = await request(app).get('/api/restaurants').query({ ...CENTER, openNow: 1 });
    expect(res.body.restaurants).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.returnedCount).toBe(0);
    expect(res.body.hasMore).toBe(false);
  });

  it('a legacy cache entry without periods degrades to the snapshot basis', async () => {
    seed([restaurant('old', { isOpen: true }), restaurant('oldclosed', { isOpen: false }), restaurant('olde', {})]);
    const res = await request(app).get('/api/restaurants').query({ ...CENTER, openNow: 1 });
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['old']);
    expect(res.body.restaurants[0].isOpenBasis).toBe('snapshot');
    const plain = await request(app).get('/api/restaurants').query(CENTER);
    const byId = Object.fromEntries(plain.body.restaurants.map((r) => [r.placeId, r.isOpenBasis]));
    expect(byId).toEqual({ old: 'snapshot', oldclosed: 'snapshot', olde: null });
  });

  it('openNow and sort never enter the cache key: one entry answers every combination', async () => {
    const key = seed([
      restaurant('a', { isOpen: true, rating: 4.2, lat: 24.6778 }),
      restaurant('b', { isOpen: false, rating: 4.9, lat: 24.69, lng: 121.7684 }),
    ], true);
    placesClient.fetchNearbyRestaurants.mockResolvedValue({ places: [makePlace('refetched')], nextPageToken: undefined });
    const cases = [
      [{}, ['a', 'b']],
      [{ openNow: 1 }, ['a']],
      [{ sort: 'distance' }, ['a', 'b']],
      [{ openNow: 'true', sort: 'rating' }, ['a']],
      [{ openNow: 0, sort: 'zzz' }, ['a', 'b']],
      [{ openNow: 1, sort: 'distance', page: 2 }, ['a']],
    ];
    for (const [query, ids] of cases) {
      const res = await request(app).get('/api/restaurants').query({ ...CENTER, ...query });
      expect(res.status).toBe(200);
      expect(res.body.restaurants.map((r) => r.placeId)).toEqual(ids);
    }
    // Every combination hit the seeded entry: no refetch and no second save proves a
    // single cache entry served them all, so neither openNow nor sort is in the key.
    expect(placesClient.fetchNearbyRestaurants).not.toHaveBeenCalled();
    expect(cache.save).not.toHaveBeenCalled();
    expect(key).toBe('24.678,121.768,1000');
  });

  it('sort=distance goes near to far, ties fall back to rating then placeId, and missing distance sorts last', async () => {
    seed([
      restaurant('mid', { rating: 4.0, lat: 24.68, lng: 121.7684 }),
      restaurant('tieB', { rating: 4.8, lat: 24.6778, lng: 121.7684 }),
      restaurant('far', { rating: 4.9, lat: 24.7, lng: 121.7684 }),
      restaurant('tieA', { rating: 4.8, lat: 24.6778, lng: 121.7684 }),
      restaurant('nodist', { rating: 5.0, lat: null, lng: null }),
    ]);
    const res = await request(app).get('/api/restaurants').query({ ...CENTER, sort: 'distance' });
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['tieA', 'tieB', 'mid', 'far', 'nodist']);
    expect(res.body.restaurants[4].distanceMeters).toBeNull();
  });

  it('sort=rating keeps working and an unknown sort leaves the natural order', async () => {
    const rows = [
      restaurant('lo', { rating: 3.1, lat: 24.68, lng: 121.7684 }),
      restaurant('hi', { rating: 4.9, lat: 24.7, lng: 121.7684 }),
    ];
    seed(rows);
    const byRating = await request(app).get('/api/restaurants').query({ ...CENTER, sort: 'rating' });
    expect(byRating.body.restaurants.map((r) => r.placeId)).toEqual(['hi', 'lo']);
    seed(rows);
    const unknown = await request(app).get('/api/restaurants').query({ ...CENTER, sort: 'nonsense' });
    expect(unknown.body.restaurants.map((r) => r.placeId)).toEqual(['lo', 'hi']);
  });

  it('applies qualify, openNow, category, sort, slice in that order', async () => {
    const weekday11to21 = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 21, minute: 0 } }));
    seed([
      restaurant('lowRatedOpen', { rating: 2.0, category: '小吃', openingPeriods: weekday11to21, lat: 24.6778 }),
      restaurant('closedOther', { category: '小吃', openingPeriods: [{ open: { day: 3, hour: 1, minute: 0 }, close: { day: 3, hour: 2, minute: 0 } }], lat: 24.6778 }),
      restaurant('openFood', { category: '美食', openingPeriods: weekday11to21, rating: 4.1, lat: 24.69, lng: 121.7684 }),
      restaurant('openSnack', { category: '小吃', openingPeriods: weekday11to21, rating: 4.5, lat: 24.678, lng: 121.7684 }),
    ]);
    const res = await request(app)
      .get('/api/restaurants')
      .query({ ...CENTER, openNow: 1, category: '小吃', sort: 'distance' });
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['openSnack']);
    expect(res.body.count).toBe(1);
  });

  it('mapPlaceToRestaurant stores compact openingPeriods from a live Places payload', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [
        makePlace('p1', {
          currentOpeningHours: {
            openNow: false,
            periods: [{ open: { day: 2, hour: 11, minute: 0 }, close: { day: 2, hour: 21, minute: 0 } }],
          },
          priceLevel: 'PRICE_LEVEL_MODERATE',
        }),
      ],
      nextPageToken: undefined,
    });
    app.__setCacheForTest({});
    const res = await request(app).get('/api/restaurants').query(CENTER);
    const r = res.body.restaurants[0];
    expect(r.openingPeriods).toEqual([{ open: { day: 2, hour: 11, minute: 0 }, close: { day: 2, hour: 21, minute: 0 } }]);
    expect(r.isOpen).toBe(true);
    expect(r.isOpenBasis).toBe('schedule');
    expect(r.priceLevel).toBe(2);
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/categories: ignores openNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(TUE_1530));
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('keeps categories of closed restaurants in the dropdown', async () => {
    seed([restaurant('open', { category: '海鮮', isOpen: true }), restaurant('closed', { category: '小吃', isOpen: false })]);
    const withFilter = await request(app).get('/api/categories').query({ ...CENTER, openNow: 1 });
    expect(withFilter.status).toBe(200);
    expect(withFilter.body).toEqual(expect.arrayContaining(['海鮮', '小吃']));
    const without = await request(app).get('/api/categories').query(CENTER);
    expect(without.body).toEqual(withFilter.body);
  });

  it('still applies the rating qualification rule', async () => {
    seed([restaurant('low', { category: '小吃', rating: 2.0 }), restaurant('ok', { category: '海鮮', rating: 4.0 })]);
    const res = await request(app).get('/api/categories').query(CENTER);
    expect(res.body).toEqual(['海鮮']);
  });
});


describe('GET /api/restaurants: multi-value category and minRating', () => {
  const weekday11to21 = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 11, minute: 0 }, close: { day, hour: 21, minute: 0 } }));

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(TUE_1530));
    app.__setCacheForTest({});
    jest.clearAllMocks();
  });

  it('category unions comma-separated values, trims whitespace and ignores empty tokens', async () => {
    seed([
      restaurant('japan', { category: '日式', rating: 4.2 }),
      restaurant('hotpot', { category: '火鍋', rating: 4.5 }),
      restaurant('snack', { category: '小吃', rating: 4.0 }),
    ]);
    const union = await request(app)
      .get('/api/restaurants')
      .query({ ...CENTER, category: ' 日式 , 火鍋 ,,' });
    expect(union.body.restaurants.map((r) => r.placeId).sort()).toEqual(['hotpot', 'japan']);
    expect(union.body.count).toBe(2);
    expect(union.body.returnedCount).toBe(2);

    // A single value keeps the original exact-match behaviour.
    const single = await request(app)
      .get('/api/restaurants')
      .query({ ...CENTER, category: '小吃' });
    expect(single.body.restaurants.map((r) => r.placeId)).toEqual(['snack']);
    expect(single.body.count).toBe(1);
    expect(placesClient.fetchNearbyRestaurants).not.toHaveBeenCalled();
  });

  it('minRating=4 keeps only rating>=4 and never returns a null rating', async () => {
    seed([
      restaurant('high', { rating: 4.8 }),
      restaurant('boundary', { rating: 4.0 }),
      restaurant('below', { rating: 3.9 }),
      restaurant('nullish', { rating: null }),
    ]);
    const res = await request(app).get('/api/restaurants').query({ ...CENTER, minRating: 4 });
    expect(res.body.restaurants.map((r) => r.placeId).sort()).toEqual(['boundary', 'high']);
    expect(res.body.restaurants.every((r) => r.rating !== null && r.rating >= 4)).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.returnedCount).toBe(2);
  });

  it('treats minRating 0, negative, over 5, non-numeric and blank like not passing it', async () => {
    seed([restaurant('lowish', { rating: 3.2 }), restaurant('high', { rating: 4.6 })]);
    for (const value of ['0', '-1', '5.1', 'abc', '', ' ', 'null']) {
      const res = await request(app).get('/api/restaurants').query({ ...CENTER, minRating: value });
      expect(res.body.restaurants.map((r) => r.placeId).sort()).toEqual(['high', 'lowish']);
    }
  });

  it('stacks category, minRating, openNow and sort=distance without changing any predicate', async () => {
    seed([
      restaurant('openSnackHigh', { category: '小吃', rating: 4.5, openingPeriods: weekday11to21, lat: 24.6778 }),
      restaurant('openSnackLow', { category: '小吃', rating: 3.9, openingPeriods: weekday11to21, lat: 24.679 }),
      restaurant('closedHotpotHigh', { category: '火鍋', rating: 4.7, openingPeriods: [{ open: { day: 3, hour: 1, minute: 0 }, close: { day: 3, hour: 2, minute: 0 } }], lat: 24.6778 }),
      restaurant('openHotpotHigh', { category: '火鍋', rating: 4.6, openingPeriods: weekday11to21, lat: 24.68 }),
    ]);
    const res = await request(app)
      .get('/api/restaurants')
      .query({ ...CENTER, category: '小吃,火鍋', minRating: 4, openNow: 1, sort: 'distance' });
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['openSnackHigh', 'openHotpotHigh']);
    expect(res.body.count).toBe(2);
  });

  it('keeps single-value category plus sort=rating unchanged', async () => {
    seed([
      restaurant('a', { category: '日式', rating: 4.2 }),
      restaurant('b', { category: '日式', rating: 4.8 }),
      restaurant('c', { category: '火鍋', rating: 4.9 }),
    ]);
    const res = await request(app)
      .get('/api/restaurants')
      .query({ ...CENTER, category: '日式', sort: 'rating' });
    expect(res.body.restaurants.map((r) => r.placeId)).toEqual(['b', 'a']);
    expect(res.body.count).toBe(2);
  });

  it('category and minRating never enter the cache key: one Places call answers every combination', async () => {
    placesClient.fetchNearbyRestaurants.mockResolvedValue({
      places: [makePlace('p1', { rating: 4.8 }), makePlace('p2', { rating: 3.2 })],
      nextPageToken: undefined,
    });
    app.__setCacheForTest({});
    const combos = [
      [{ category: '其他' }, ['p1', 'p2']],
      [{ minRating: 4 }, ['p1']],
      [{ category: '其他,其他', minRating: 4, sort: 'rating' }, ['p1']],
      [{ category: '', minRating: 0, sort: 'distance' }, ['p1', 'p2']],
    ];
    for (const [query, expected] of combos) {
      const res = await request(app).get('/api/restaurants').query({ ...CENTER, ...query });
      expect(res.body.restaurants.map((r) => r.placeId)).toEqual(expected);
    }
    expect(placesClient.fetchNearbyRestaurants).toHaveBeenCalledTimes(1);
  });
});
