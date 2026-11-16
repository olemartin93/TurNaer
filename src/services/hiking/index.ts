/**
 * Provider registry and nearby-trip search.
 *
 * Status of Norwegian sources (checked November 2026):
 * - OpenStreetMap (Overpass): open data (ODbL), free, CORS-enabled → enabled.
 * - UT.no (DNT): its API (api.ut.no) refuses anonymous data queries, and the GraphQL
 *   endpoint used by the ut.no website is an internal proxy, not a public API.
 *   → not used. UT.no pages are still linked when OSM routes reference them.
 * - Morotur: no documented public, browser-accessible API could be verified.
 *   → not used directly. Morotur pages are linked when OSM routes reference them.
 *   With the provider's permission, an export can be placed in public/data/morotur.json
 *   and enabled with NEXT_PUBLIC_ENABLE_MOROTUR_DATASET=true.
 * - Static dataset (public/data/trips.json): enabled, empty by default.
 */
import type { HikingProvider } from "./provider";
import { DatasetProvider } from "./datasetProvider";
import { OpenStreetMapProvider } from "./osmProvider";
import type { HikingTrip, NearbyTrip } from "@/types/trip";
import type { LatLon } from "@/types/geo";
import { calculateDistance } from "@/lib/geo/distance";

export const MoroturProvider = new DatasetProvider(
  "morotur",
  "Morotur dataset",
  "/data/morotur.json",
  process.env.NEXT_PUBLIC_ENABLE_MOROTUR_DATASET === "true",
);
export const UTProvider = new DatasetProvider(
  "ut",
  "UT.no dataset",
  "/data/ut.json",
  process.env.NEXT_PUBLIC_ENABLE_UT_DATASET === "true",
);
export const StaticTripProvider = new DatasetProvider("static", "TurNær dataset", "/data/trips.json");
export const OsmProvider = new OpenStreetMapProvider();

export const providers: HikingProvider[] = [OsmProvider, StaticTripProvider, MoroturProvider, UTProvider];

export type NearbyTripsResult = {
  trips: NearbyTrip[];
  /** True when a provider (or part of one) failed; the UI shows a gentle notice. */
  incomplete: boolean;
};

function dedupe(trips: HikingTrip[]): HikingTrip[] {
  const seen = new Set<string>();
  return trips.filter((t) => {
    const key = t.sourceUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function withDistance(trip: HikingTrip, from: LatLon | null): NearbyTrip {
  return { ...trip, distanceFromUserKm: from ? calculateDistance(from, trip) : null };
}

function rank(all: HikingTrip[], center: LatLon, radiusKm: number): NearbyTrip[] {
  return dedupe(all)
    .map((t) => withDistance(t, center))
    .filter((t) => (t.distanceFromUserKm ?? Infinity) <= radiusKm)
    .sort((a, b) => (a.distanceFromUserKm ?? 0) - (b.distanceFromUserKm ?? 0));
}

/**
 * Find trips within `radiusKm` of `center`, from all enabled providers, sorted by distance.
 * `onPartial` receives the trips found so far while slower providers are still loading.
 */
export async function getNearbyTrips(
  center: LatLon,
  radiusKm: number,
  signal?: AbortSignal,
  onPartial?: (trips: NearbyTrip[]) => void,
): Promise<NearbyTripsResult> {
  const active = providers.filter((p) => p.isEnabled());
  const partial = new Map<string, HikingTrip[]>();
  const report = () => onPartial?.(rank([...partial.values()].flat(), center, radiusKm));

  const settled = await Promise.allSettled(
    active.map(async (p) => {
      const result = await p.getNearbyTrips(center.latitude, center.longitude, radiusKm, {
        signal,
        onPartial: (trips) => {
          partial.set(p.id, trips);
          report();
        },
      });
      partial.set(p.id, result.trips);
      if (result.trips.length > 0) report();
      return result;
    }),
  );
  let incomplete = false;
  let failed = 0;
  const all: HikingTrip[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      all.push(...r.value.trips);
      incomplete ||= !!r.value.incomplete;
    } else {
      failed++;
      incomplete = true;
    }
  }
  const trips = rank(all, center, radiusKm);
  // Nothing found while some source failed: that's an error, not "no trips nearby".
  if (trips.length === 0 && (failed > 0 || incomplete)) throw new Error("Trip providers failed");
  return { trips, incomplete };
}

/** Fetch one trip (with route geometry where the provider supports it). */
export async function getTripById(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null> {
  const provider = providers.find((p) => p.isEnabled() && p.ownsTrip?.(tripId));
  return provider?.getTripById ? provider.getTripById(tripId, signal) : null;
}
