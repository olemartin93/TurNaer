/**
 * MET Norway Locationforecast 2.0 (https://api.met.no/weatherapi/locationforecast/2.0/).
 *
 * - Free, no key. Data licensed CC BY 4.0 / NLOD, credit "MET Norway".
 * - Terms: identify your application, respect Expires/Last-Modified, don't hammer the API,
 *   and use at most 4 decimals in coordinates. Browsers cannot set a custom User-Agent
 *   (it is a forbidden header), so requests from this static site are identified by the
 *   browser's Origin/Referer, which MET accepts for browser-based apps.
 * - We round coordinates to 3 decimals (~100 m) which also improves cache hits, honour
 *   the Expires header, and cache responses in localStorage.
 */
import { config } from "@/lib/config";
import { fetchJson } from "@/lib/http";
import { readCache, writeCache } from "@/lib/cache";
import type { LatLon } from "@/types/geo";
import type { WeatherForecast, WeatherPoint } from "@/types/weather";

type Details = Record<string, number | undefined>;
type Period = { summary?: { symbol_code?: string }; details?: Details };

type MetResponse = {
  properties?: {
    meta?: { updated_at?: string };
    timeseries?: {
      time: string;
      data?: {
        instant?: { details?: Details };
        next_1_hours?: Period;
        next_6_hours?: Period;
      };
    }[];
  };
};

const MIN_TTL_MS = 10 * 60 * 1000;
const MAX_HOURS = 48;
const inflight = new Map<string, Promise<WeatherForecast>>();

const round = (n: number): number => Math.round(n * 1000) / 1000;

export async function getWeather(point: LatLon, signal?: AbortSignal): Promise<WeatherForecast> {
  const lat = round(point.latitude);
  const lon = round(point.longitude);
  const cacheKey = `wx:${lat},${lon}`;
  const cached = readCache<WeatherForecast>(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    try {
      const { data, response } = await fetchJson<MetResponse>(
        `${config.met.locationForecastApi}/complete?lat=${lat}&lon=${lon}`,
        { signal, headers: { Accept: "application/json" } },
      );
      const expiresHeader = response.headers.get("Expires");
      const expiresAt = Math.max(
        Date.now() + MIN_TTL_MS,
        expiresHeader ? Date.parse(expiresHeader) || 0 : 0,
      );
      const forecast: WeatherForecast = {
        latitude: lat,
        longitude: lon,
        updatedAt: data.properties?.meta?.updated_at,
        expiresAt,
        points: (data.properties?.timeseries ?? []).slice(0, MAX_HOURS).map((t): WeatherPoint => {
          const instant = t.data?.instant?.details ?? {};
          const period = t.data?.next_1_hours ?? t.data?.next_6_hours;
          const hourly = t.data?.next_1_hours?.details;
          return {
            time: t.time,
            temperatureC: instant.air_temperature,
            windSpeedMs: instant.wind_speed,
            windGustMs: instant.wind_speed_of_gust,
            windFromDeg: instant.wind_from_direction,
            cloudCoverPct: instant.cloud_area_fraction,
            fogPct: instant.fog_area_fraction,
            humidityPct: instant.relative_humidity,
            symbolCode: period?.summary?.symbol_code,
            precipitationMm: hourly?.precipitation_amount,
            precipitationProbabilityPct: hourly?.probability_of_precipitation,
            thunderProbabilityPct: hourly?.probability_of_thunder,
          };
        }),
      };
      // Keep it around for 24h so it is still available offline (marked stale by expiresAt).
      writeCache(cacheKey, forecast, 24 * 60 * 60 * 1000);
      return forecast;
    } catch (error) {
      // Offline or failing: fall back to a stale copy if we have one.
      const stale = readCache<WeatherForecast>(cacheKey, { allowExpired: true });
      if (stale) return stale;
      throw error;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, request);
  return request;
}

/** The forecast entry closest to now (the first one that is not in the past). */
export function currentWeather(forecast: WeatherForecast): WeatherPoint | undefined {
  const now = Date.now() - 30 * 60 * 1000;
  return forecast.points.find((p) => Date.parse(p.time) >= now) ?? forecast.points[forecast.points.length - 1];
}
