const path = require('path');
const fs = require('fs');

// Resolve relative to this file, not process.cwd(), so `node backend/src/server.js`
// from the project root still finds backend/.env. Falls back to dotenv's default
// lookup (and does not throw) when the file is absent, e.g. in Render where env
// vars are injected directly.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const placesClient = require('./placesClient');
const cache = require('./cache');
const { categorize, CATEGORY_ORDER } = require('./categorize');

// Overridable in tests; defaults to the frontend's Vite build output.
const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.join(__dirname, '..', '..', 'frontend', 'dist');
const FRONTEND_INDEX_HTML = path.join(FRONTEND_DIST_DIR, 'index.html');

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map((o) => o.trim())
  : DEFAULT_ALLOWED_ORIGINS;

const DEFAULT_RADIUS_METERS = 4000;
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20;
const SCHEMA_VERSION = 2;
const MAX_PLACES_PER_PAGE = 20;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

const app = express();

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

let cacheMap = {};

// Per-cacheKey in-flight fetches, so concurrent /api/restaurants and
// /api/categories requests for the same location share one Places API call.
const inFlightFetches = new Map();

// Per-IP refresh cooldown timestamps.
const refreshCooldowns = new Map();

(function loadFromCache() {
  const cached = cache.load();
  if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
    cacheMap = cached;
  }
})();

function mapsUrlFor(name, placeId) {
  const params = new URLSearchParams({ api: '1', query: name, query_place_id: placeId });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function normalizePriceLevel(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string') {
    if (Object.prototype.hasOwnProperty.call(PRICE_LEVEL_MAP, raw)) {
      return PRICE_LEVEL_MAP[raw];
    }
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function mapPlaceToRestaurant(place) {
  const name = place.displayName?.text || '';
  const openNow = place.currentOpeningHours?.openNow;
  return {
    placeId: place.id,
    name,
    rating: typeof place.rating === 'number' ? place.rating : null,
    userRatingsTotal: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    address: place.formattedAddress || '',
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    category: categorize(name, place.types),
    mapsUrl: mapsUrlFor(name, place.id),
    isOpen: typeof openNow === 'boolean' ? openNow : null,
    priceLevel: normalizePriceLevel(place.priceLevel),
  };
}

function resolveLatLng(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (query.lat === undefined || query.lng === undefined) {
    return { error: 'lat and lng query parameters are required' };
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { error: 'lat must be a number between -90 and 90' };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { error: 'lng must be a number between -180 and 180' };
  }
  return { lat, lng };
}

function resolveRadius(rawRadius) {
  if (rawRadius === undefined) return DEFAULT_RADIUS_METERS;
  const radius = Number(rawRadius);
  if (!Number.isFinite(radius) || radius < MIN_RADIUS_METERS || radius > MAX_RADIUS_METERS) {
    return DEFAULT_RADIUS_METERS;
  }
  return radius;
}

function resolvePages(rawPages) {
  if (rawPages === undefined) return 1;
  const pages = Number(rawPages);
  if (!Number.isFinite(pages)) return 1;
  return Math.min(3, Math.max(1, Math.trunc(pages)));
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
    return null;
  }
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function clientIp(req) {
  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}

function refreshAllowed(req) {
  const token = process.env.REFRESH_TOKEN;
  if (token) {
    const headerToken =
      req.headers['x-refresh-token'] ||
      req.headers['refresh-token'] ||
      (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);
    if (headerToken && headerToken === token) return true;
  }
  const now = Date.now();
  const ip = clientIp(req);
  const last = refreshCooldowns.get(ip);
  if (last && now - last < REFRESH_COOLDOWN_MS) {
    return false;
  }
  refreshCooldowns.set(ip, now);
  return true;
}

function cacheKeyFor(lat, lng, radius) {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
}

function isFresh(entry) {
  if (!entry || typeof entry.updatedAt !== 'string') return false;
  if (entry.schemaVersion !== SCHEMA_VERSION) return false;
  const age = Date.now() - new Date(entry.updatedAt).getTime();
  return Number.isFinite(age) && age < CACHE_TTL_MS;
}

function setCacheEntry(key, restaurantsList) {
  const updatedAt = new Date().toISOString();
  cacheMap[key] = { restaurants: restaurantsList, updatedAt, schemaVersion: SCHEMA_VERSION };

  const keys = Object.keys(cacheMap);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const oldestFirst = keys.sort(
      (a, b) => new Date(cacheMap[a].updatedAt).getTime() - new Date(cacheMap[b].updatedAt).getTime()
    );
    for (const staleKey of oldestFirst.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
      delete cacheMap[staleKey];
    }
  }

  cache.save(cacheMap);
  return cacheMap[key];
}

function normalizePlacesResult(result) {
  if (Array.isArray(result)) {
    return { places: result, nextPageToken: result.nextPageToken };
  }
  if (result && Array.isArray(result.places)) {
    return { places: result.places, nextPageToken: result.nextPageToken || result.next_page_token };
  }
  if (result && Array.isArray(result.results)) {
    return { places: result.results, nextPageToken: result.nextPageToken || result.next_page_token };
  }
  return { places: [], nextPageToken: undefined };
}

async function fetchPlacesPage(params) {
  const result = await placesClient.fetchNearbyRestaurants(params);
  return normalizePlacesResult(result);
}

async function fetchAndCache(key, lat, lng, radius, pages = 1) {
  const allPlaces = [];
  let pageToken;
  let hasMore = false;
  const pageCount = Math.min(3, Math.max(1, Number.isFinite(pages) ? Math.trunc(pages) : 1));
  for (let i = 0; i < pageCount; i++) {
    const { places, nextPageToken } = await fetchPlacesPage({ lat, lng, radiusMeters: radius, pageToken });
    allPlaces.push(...places.map(mapPlaceToRestaurant));
    pageToken = nextPageToken;
    if (!pageToken) {
      hasMore = false;
      break;
    }
    hasMore = true;
  }
  const entry = setCacheEntry(key, allPlaces);
  entry.hasMore = hasMore;
  return entry;
}

// Returns a fresh cache entry, joining (or starting) a shared fetch for this key.
function getOrFetchEntry(key, lat, lng, radius, pages = 1) {
  const entry = cacheMap[key];
  if (isFresh(entry)) {
    return Promise.resolve(entry);
  }

  const inFlight = inFlightFetches.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = fetchAndCache(key, lat, lng, radius, pages).finally(() => {
    if (inFlightFetches.get(key) === promise) {
      inFlightFetches.delete(key);
    }
  });
  inFlightFetches.set(key, promise);
  return promise;
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/restaurants', async (req, res) => {
  const { category, sort } = req.query;
  const { lat, lng, error } = resolveLatLng(req.query);
  if (error) {
    return res.status(400).json({ error });
  }
  const radius = resolveRadius(req.query.radius);
  const pages = resolvePages(req.query.pages);
  const key = cacheKeyFor(lat, lng, radius);

  let entry;
  try {
    entry = await getOrFetchEntry(key, lat, lng, radius, pages);
  } catch (err) {
    console.error('Failed to fetch restaurants:', err.message);
    return res.status(502).json({ error: 'Failed to fetch restaurants from Google Places API' });
  }

  let list = entry.restaurants.map((r) => ({
    ...r,
    mapsUrl: mapsUrlFor(r.name, r.placeId),
    distanceMeters: haversineMeters(lat, lng, r.lat, r.lng),
  }));
  if (category) {
    list = list.filter((r) => r.category === category);
  }
  if (sort === 'rating') {
    list = [...list].sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity));
  }

  const maxItems = pages * MAX_PLACES_PER_PAGE;
  const sliced = list.slice(0, maxItems);

  res.status(200).json({
    restaurants: sliced,
    returnedCount: sliced.length,
    hasMore: Boolean(entry.hasMore),
    count: sliced.length,
  });
});

app.get('/api/categories', async (req, res) => {
  const { lat, lng, error } = resolveLatLng(req.query);
  if (error) {
    return res.status(400).json({ error });
  }
  const radius = resolveRadius(req.query.radius);
  const key = cacheKeyFor(lat, lng, radius);

  let entry;
  try {
    entry = await getOrFetchEntry(key, lat, lng, radius, 1);
  } catch (err) {
    console.error('Failed to fetch categories:', err.message);
    return res.status(502).json({ error: 'Failed to fetch categories from Google Places API' });
  }

  const present = new Set(entry.restaurants.map((r) => r.category));
  const categories = CATEGORY_ORDER.filter((c) => present.has(c));
  res.status(200).json(categories);
});

app.post('/api/restaurants/refresh', async (req, res) => {
  const { lat, lng, error } = resolveLatLng(req.query);
  if (error) {
    return res.status(400).json({ error });
  }
  if (!refreshAllowed(req)) {
    return res.status(429).json({ error: 'Refresh cooldown active; try again later' });
  }
  const radius = resolveRadius(req.query.radius);
  const key = cacheKeyFor(lat, lng, radius);

  try {
    const entry = await fetchAndCache(key, lat, lng, radius, 1);
    res.status(200).json({ count: entry.restaurants.length, updatedAt: entry.updatedAt });
  } catch (err) {
    console.error('Failed to refresh restaurants:', err.message);
    res.status(502).json({ error: 'Failed to refresh restaurants from Google Places API' });
  }
});

// Test-only helper to seed in-memory cache state without touching the cache file or Google API.
app.__setCacheForTest = (map) => {
  cacheMap = map;
  inFlightFetches.clear();
  refreshCooldowns.clear();
};
app.__resetRefreshCooldown = () => {
  refreshCooldowns.clear();
};
app.SCHEMA_VERSION = SCHEMA_VERSION;

// Serves the built frontend (frontend/dist) if present; in dev the frontend
// runs separately on Vite (5173), so a missing dist just means we skip this.
if (fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.get('*', (req, res, next) => {
  if (fs.existsSync(FRONTEND_INDEX_HTML)) {
    return res.sendFile(FRONTEND_INDEX_HTML);
  }
  next();
});

module.exports = app;
