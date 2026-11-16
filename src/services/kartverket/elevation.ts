/**
 * Kartverket elevation API (Geonorge "høydedata" v1).
 *
 * GET {elevationApi}/punkt?koordsys=4258&geojson=false&punkter=[[lon,lat],...]
 * Response: { punkter: [{ x, y, z, terreng, datakilde }] }
 *
 * The service accepts at most 50 points per request, so requests are chunked.
 * `z` is null where the terrain model has no data (e.g. outside Norway).
 * Data: © Kartverket, CC BY 4.0.
 */
import { config } from "@/lib/config";
import { fetchJson } from "@/lib/http";
import { readCache, writeCache } from "@/lib/cache";
import type { LatLon } from "@/types/geo";

const MAX_POINTS_PER_REQUEST = 50;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // terrain barely changes

type ElevationResponse = {
  punkter?: { x?: number; y?: number; z?: number | null; terreng?: string; datakilde?: string }[];
};

export type ElevationSample = LatLon & {
  elevationM: number | null;
  terrain?: string;
  dataSource?: string;
};

const key = (p: LatLon): string => `elev:${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;

/** Terrain elevation for a list of points (order preserved). */
export async function getElevation(points: LatLon[], signal?: AbortSignal): Promise<ElevationSample[]> {
  const results: ElevationSample[] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    const chunk = points.slice(i, i + MAX_POINTS_PER_REQUEST);
    const punkter = JSON.stringify(chunk.map((p) => [Number(p.longitude.toFixed(6)), Number(p.latitude.toFixed(6))]));
    const params = new URLSearchParams({ koordsys: "4258", geojson: "false", punkter });
    const { data } = await fetchJson<ElevationResponse>(`${config.kartverket.elevationApi}/punkt?${params}`, {
      signal,
      timeoutMs: 20000,
    });
    const returned = data.punkter ?? [];
    chunk.forEach((p, j) => {
      const r = returned[j];
      results.push({
        ...p,
        elevationM: typeof r?.z === "number" ? r.z : null,
        terrain: r?.terreng,
        dataSource: r?.datakilde,
      });
    });
  }
  return results;
}

/** Elevation for a single point, cached in the browser. */
export async function getPointElevation(point: LatLon, signal?: AbortSignal): Promise<ElevationSample> {
  const cached = readCache<ElevationSample>(key(point));
  if (cached) return cached;
  const [sample] = await getElevation([point], signal);
  const result = sample ?? { ...point, elevationM: null };
  writeCache(key(point), result, CACHE_TTL_MS);
  return result;
}
