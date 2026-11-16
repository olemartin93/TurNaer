/**
 * Central runtime configuration. Values come from NEXT_PUBLIC_* variables,
 * which are inlined at build time; defaults are the public, key-less APIs.
 */
const trimSlash = (value: string): string => value.replace(/\/+$/, "");

export const BASE_PATH: string = trimSlash(process.env.NEXT_PUBLIC_BASE_PATH ?? "");

export const SITE_URL: string = trimSlash(process.env.NEXT_PUBLIC_SITE_URL ?? "");

export const config = {
  kartverket: {
    addressApi: trimSlash(
      process.env.NEXT_PUBLIC_KARTVERKET_ADDRESS_API_URL || "https://ws.geonorge.no/adresser/v1",
    ),
    placeNamesApi: trimSlash(
      process.env.NEXT_PUBLIC_KARTVERKET_PLACENAMES_API_URL || "https://api.kartverket.no/stedsnavn/v1",
    ),
    elevationApi: trimSlash(
      process.env.NEXT_PUBLIC_KARTVERKET_ELEVATION_API_URL || "https://ws.geonorge.no/hoydedata/v1",
    ),
  },
  met: {
    locationForecastApi: trimSlash(
      process.env.NEXT_PUBLIC_MET_API_URL || "https://api.met.no/weatherapi/locationforecast/2.0",
    ),
  },
  osm: {
    overpassUrls: (process.env.NEXT_PUBLIC_OVERPASS_API_URLS || "https://overpass-api.de/api/interpreter")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean),
  },
} as const;

/** Prefix a site-relative path with the base path ("/data/x.json" -> "/TurNaer/data/x.json"). */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
