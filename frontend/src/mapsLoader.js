import { Loader } from '@googlemaps/js-api-loader'

let loaderPromise = null

export function loadGoogleMaps() {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      version: 'weekly',
      libraries: ['places'],
    })
    loaderPromise = loader.load().then((googleNamespace) => googleNamespace.maps)
  }
  return loaderPromise
}
