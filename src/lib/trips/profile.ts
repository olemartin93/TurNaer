import type { LineString, MultiLineString } from "geojson";
import { getElevation } from "@/services/kartverket/elevation";
import { mainLine, resampleLine } from "@/lib/geo/route";
import { readCache, writeCache } from "@/lib/cache";

export type ProfilePoint = { distanceKm: number; elevationM: number | null; latitude: number; longitude: number };

export type ElevationProfile = {
  points: ProfilePoint[];
  lengthKm: number;
  gainM: number;
  lossM: number;
  maxM: number;
  minM: number;
  /** Share of samples that returned an elevation (0–1). */
  coverage: number;
  dataSource?: string;
};

const SAMPLES = 100;
/** Ignore ups and downs smaller than this to reduce noise in the gain estimate. */
const HYSTERESIS_M = 3;

/**
 * Build an elevation profile by sampling Kartverket's terrain model along the
 * route's longest continuous line. Returns null when there is no usable data.
 */
export async function buildElevationProfile(
  cacheId: string,
  route: LineString | MultiLineString,
  signal?: AbortSignal,
): Promise<ElevationProfile | null> {
  const cacheKey = `profile:${cacheId}`;
  const cached = readCache<ElevationProfile>(cacheKey);
  if (cached) return cached;

  const line = mainLine(route);
  const samples = resampleLine(line, Math.min(SAMPLES, Math.max(10, line.length)));
  if (samples.length < 2) return null;
  const elevations = await getElevation(
    samples.map((s) => ({ latitude: s.position[1] ?? 0, longitude: s.position[0] ?? 0 })),
    signal,
  );
  const points: ProfilePoint[] = samples.map((s, i) => ({
    distanceKm: s.distanceKm,
    elevationM: elevations[i]?.elevationM ?? null,
    latitude: s.position[1] ?? 0,
    longitude: s.position[0] ?? 0,
  }));
  const valid = points.map((p) => p.elevationM).filter((z): z is number => z != null);
  const coverage = valid.length / points.length;
  if (valid.length < 2 || coverage < 0.5) return null;

  let gain = 0;
  let loss = 0;
  let ref = valid[0] ?? 0;
  for (const z of valid.slice(1)) {
    const d = z - ref;
    if (d >= HYSTERESIS_M) {
      gain += d;
      ref = z;
    } else if (d <= -HYSTERESIS_M) {
      loss -= d;
      ref = z;
    }
  }
  const profile: ElevationProfile = {
    points,
    lengthKm: samples[samples.length - 1]?.distanceKm ?? 0,
    gainM: gain,
    lossM: loss,
    maxM: Math.max(...valid),
    minM: Math.min(...valid),
    coverage,
    dataSource: elevations.find((e) => e.dataSource)?.dataSource,
  };
  writeCache(cacheKey, profile, 30 * 24 * 60 * 60 * 1000);
  return profile;
}
