# TurNær

**Find a great hike near you.** TurNær is a static, installable web app (PWA) that helps you discover hiking trips close to your location in Norway. It shows real routes on a map with weather and terrain, and links to the original trip page (Morotur, UT.no or OpenStreetMap) for the full description.

It runs entirely in the browser: no backend, no database, no API keys, no analytics. It's hosted on GitHub Pages.

## Features

- **Find trips near me**: browser geolocation, requested only when you press the button. Fallbacks: place/address search (Kartverket) or picking a point on the map.
- **Interactive map** (Leaflet): Kartverket topographic map (default), grey topo, OpenStreetMap, and an optional Waymarked Trails overlay. Clustered trip markers, user location, search radius, a "locate me" control, the selected route with its trailhead, and keyboard support.
- **Nearby trips**: hiking route relations from OpenStreetMap (via Overpass), sorted by approximate straight-line (Haversine) distance. Radius 5/10/25/50/100 km (default 25).
- **Trip cards**: distance, difficulty, duration, elevation gain, current weather, source and a **View trip** link that opens in a new tab.
- **Trip detail**: route on the map, trip facts, an **elevation profile** sampled from Kartverket's terrain model, highest and lowest point, ascent, a MET Norway forecast and a weather-condition reading.
- **Filters** (difficulty, duration, elevation gain, favourites) and **weather-aware ranking**.
- **Favourites** and **shareable trip links** (`?trip=osm-r123456`). The user's location is never put in a URL.
- **PWA**: manifest, icons, service worker, offline fallback, and an "You are offline" banner. Previously loaded trips, weather and terrain stay available offline. Map tiles are deliberately not cached.

Values TurNær computes itself are marked with **≈**: route length from the route geometry, ascent from the terrain model, and duration from Naismith's rule. Missing data is shown as "Not stated", never invented.

## Data sources

| Source | Used for | Endpoint(s) | Licence |
| --- | --- | --- | --- |
| Kartverket – Stedsnavn | Place search, reverse geocoding | `https://api.kartverket.no/stedsnavn/v1/navn`, `/punkt` | CC BY 4.0 |
| Kartverket – Adresser | Address search | `https://ws.geonorge.no/adresser/v1/sok` | CC BY 4.0 |
| Kartverket – Høydedata | Elevation profiles (≤ 50 points per request) | `https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4258&punkter=[[lon,lat],…]` | CC BY 4.0 |
| Kartverket – WMTS cache | Topographic base maps | `https://cache.kartverket.no/v1/wmts/1.0.0/{topo,topograatone}/default/webmercator/{z}/{y}/{x}.png` | CC BY 4.0 |
| MET Norway – Locationforecast 2.0 | Weather | `https://api.met.no/weatherapi/locationforecast/2.0/complete` | CC BY 4.0 / NLOD |
| OpenStreetMap via Overpass | Hiking routes and geometry | `https://overpass-api.de/api/interpreter` | ODbL |
| OpenStreetMap tiles | Alternative base map | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | ODbL; tile usage policy |
| Waymarked Trails | Hiking-trail overlay | `https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png` | CC BY-SA |

Attribution is shown on the map and on the **About & data** page. TurNær is not affiliated with any of these providers.

### API etiquette

- **MET Norway**: browsers can't set a custom `User-Agent` (it is a forbidden header), so requests from the static site are identified by the browser's `Origin`/`Referer`. Coordinates are rounded to 3 decimals. The `Expires` header is respected, and responses are cached in `localStorage` and de-duplicated in flight. Weather is fetched only for the 12 closest trips and the selected trip.
- **Overpass**: one small bounding-box query per search, with the query area rounded so nearby searches share the cache. Results are cached for 12 hours. Route geometry is fetched only for the selected trip.
- **Kartverket**: the elevation API takes at most 50 points per request, so profiles use 100 samples split into 2 requests. Profiles are cached for 30 days.

### Hiking-trip sources: status

Checked November 2026:

- **OpenStreetMap**: open data, free, CORS-enabled. **Used** as the primary live source. If a route's `website`/`url` tag points at `morotur.no` or `ut.no`, the card links straight to that page.
- **UT.no (DNT)**: `api.ut.no` refuses anonymous data queries, and the GraphQL endpoint the ut.no website uses is an internal proxy, not a public API. **Not used** and not scraped.
- **Morotur**: no documented public, browser-accessible API could be verified. **Not used** and not scraped.
- **Static datasets**: the adapter architecture lets you add data without code changes (see below).

## Architecture

```
src/
  app/                 Next.js App Router pages (/, /about), layout, manifest
  components/          UI (map, cards, detail, filters, search, landing…)
    map/MapView.tsx    Leaflet map, loaded with next/dynamic (ssr: false)
  hooks/               useWeather, useTripDetail, useFavorites, useOnlineStatus…
  services/
    kartverket/        geocoding.ts (searchAddress, reverseGeocode), elevation.ts (getElevation)
    met/               locationforecast.ts (getWeather)
    osm/               overpass.ts
    hiking/            provider.ts (HikingProvider interface), osmProvider.ts,
                       datasetProvider.ts, index.ts (registry + getNearbyTrips)
  lib/
    geo/               distance.ts (calculateDistance – Haversine), geolocation.ts
                       (getCurrentLocation), route.ts
    weather/           assessment.ts (condition reading), symbols.ts
    trips/             filters, ranking, elevation profile, formatting, estimates
  types/               HikingTrip, WeatherForecast, geo types
public/data/           Static trip datasets (trips.json is empty by default)
scripts/               Service-worker generator, icon generator
```

UI components never call APIs directly. They go through hooks, which call the service layer.

### Adding a trip source

Implement `HikingProvider` (`src/services/hiking/provider.ts`) and register it in `src/services/hiking/index.ts`:

```ts
interface HikingProvider {
  readonly id: string;
  readonly name: string;
  isEnabled(): boolean;
  getNearbyTrips(latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal): Promise<HikingTrip[]>;
  ownsTrip?(tripId: string): boolean;
  getTripById?(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null>;
}
```

If a source has no browser-accessible API, export its data (with the provider's permission) to a static JSON file instead:

```json
{
  "trips": [
    {
      "id": "unique-id",
      "name": "Trip name",
      "latitude": 62.47,
      "longitude": 6.15,
      "positionKind": "start",
      "lengthKm": 5.1,
      "elevationGain": 320,
      "difficulty": "moderate",
      "estimatedTimeMinutes": 90,
      "source": "morotur",
      "sourceUrl": "https://morotur.no/…",
      "route": { "type": "LineString", "coordinates": [[6.15, 62.47], [6.16, 62.48]] }
    }
  ]
}
```

- `public/data/trips.json` is always loaded (empty by default).
- `public/data/morotur.json` and `public/data/ut.json` are loaded when `NEXT_PUBLIC_ENABLE_MOROTUR_DATASET=true` or `NEXT_PUBLIC_ENABLE_UT_DATASET=true` is set.
- Entries without a valid `sourceUrl` are ignored, so the app never shows a trip without a real link.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm run build        # static export to ./out, then generates out/sw.js
```

Test a sub-path build the way GitHub Pages serves it:

```bash
NEXT_PUBLIC_BASE_PATH=/TurNaer npm run build
mkdir -p /tmp/site && ln -sfn "$PWD/out" /tmp/site/TurNaer
cd /tmp/site && python3 -m http.server 8080   # http://localhost:8080/TurNaer/
```

Geolocation and service workers need a secure context: `localhost` or https.

### Environment variables

All are optional; see `.env.example`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path, e.g. `/TurNaer`. Set automatically in CI. |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL for Open Graph metadata. Set automatically in CI. |
| `NEXT_PUBLIC_KARTVERKET_ADDRESS_API_URL`, `NEXT_PUBLIC_KARTVERKET_PLACENAMES_API_URL`, `NEXT_PUBLIC_KARTVERKET_ELEVATION_API_URL` | Kartverket endpoints |
| `NEXT_PUBLIC_MET_API_URL` | MET Locationforecast base URL |
| `NEXT_PUBLIC_OVERPASS_API_URLS` | Comma-separated Overpass endpoints, tried in order |
| `NEXT_PUBLIC_ENABLE_MOROTUR_DATASET`, `NEXT_PUBLIC_ENABLE_UT_DATASET` | Load the optional static datasets |

No secrets are used. Never put private keys in `NEXT_PUBLIC_*` variables: they are embedded in the client bundle.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` type-checks, lints, builds and deploys on every push to `main`. It can also be started manually.

1. In the repository go to **Settings → Pages → Build and deployment** and set **Source: GitHub Actions**.
2. Push to `main`. The workflow reads the Pages base path (e.g. `/TurNaer`) from `actions/configure-pages` and passes it to the build as `NEXT_PUBLIC_BASE_PATH`.

## Privacy

- Location is requested only when the user presses **Find trips near me**, and it stays in the browser.
- Coordinates go only to the public APIs above, directly from the browser. Weather requests use rounded coordinates.
- No accounts, no analytics, no tracking. Favourites, the last search (rounded to about 100 m) and cached data live in `localStorage` and the Cache API. They can be cleared from the About page.

## Disclaimer

Weather-condition readings are a rough guide, not a safety assessment. Always check official forecasts and warnings ([varsom.no](https://www.varsom.no/)), and follow the Norwegian mountain code (Fjellvettreglene).
