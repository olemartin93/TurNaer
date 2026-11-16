import type { NearbyTrip } from "@/types/trip";
import type { ConditionLevel } from "@/types/weather";

export type SortMode = "distance" | "weather";

const WEATHER_PENALTY: Record<ConditionLevel | "unknown", number> = {
  favorable: 1,
  unknown: 1.6,
  mixed: 2,
  challenging: 4,
};

/**
 * Weather-aware ranking: distance is multiplied by a penalty for the forecast
 * conditions, so a slightly farther trip with better weather can rank higher.
 */
export function rankTrips(
  trips: NearbyTrip[],
  mode: SortMode,
  conditions: ReadonlyMap<string, ConditionLevel>,
): NearbyTrip[] {
  const dist = (t: NearbyTrip) => t.distanceFromUserKm ?? 0;
  if (mode === "distance") return [...trips].sort((a, b) => dist(a) - dist(b));
  const score = (t: NearbyTrip) => (dist(t) + 1) * WEATHER_PENALTY[conditions.get(t.id) ?? "unknown"];
  return [...trips].sort((a, b) => score(a) - score(b));
}
