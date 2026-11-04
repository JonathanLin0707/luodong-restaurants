const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.formattedAddress',
  'places.location',
  'places.types',
].join(',');
const MAX_RESULT_COUNT = 20;

async function fetchNearbyRestaurants({ lat, lng, radiusMeters }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not set');
  }

  const body = {
    includedTypes: ['restaurant'],
    languageCode: 'zh-TW',
    maxResultCount: MAX_RESULT_COUNT,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
  };

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Places API request failed with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.places || [];
}

module.exports = { fetchNearbyRestaurants };
