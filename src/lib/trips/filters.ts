import type { Difficulty, NearbyTrip } from "@/types/trip";

export const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS)[number];
export const DEFAULT_RADIUS: RadiusKm = 25;

export const DURATION_BUCKETS = [
  { id: "lt1", label: "Under 1 hour", min: 0, max: 60 },
  { id: "1to2", label: "1–2 hours", min: 60, max: 120 },
  { id: "2to4", label: "2–4 hours", min: 120, max: 240 },
  { id: "gt4", label: "4+ hours", min: 240, max: Infinity },
] as const;

export const ELEVATION_BUCKETS = [
  { id: "lt200", label: "Under 200 m", min: 0, max: 200 },
  { id: "200to500", label: "200–500 m", min: 200, max: 500 },
  { id: "500to1000", label: "500–1000 m", min: 500, max: 1000 },
  { id: "gt1000", label: "1000+ m", min: 1000, max: Infinity },
] as const;

export type DurationBucket = (typeof DURATION_BUCKETS)[number]["id"];
export type ElevationBucket = (typeof ELEVATION_BUCKETS)[number]["id"];

export type TripFilters = {
  difficulties: Difficulty[];
  durations: DurationBucket[];
  elevations: ElevationBucket[];
  /** Keep trips whose value for an active filter is unknown. */
  includeUnknown: boolean;
  favoritesOnly: boolean;
};

export const EMPTY_FILTERS: TripFilters = {
  difficulties: [],
  durations: [],
  elevations: [],
  includeUnknown: true,
  favoritesOnly: false,
};

export function activeFilterCount(f: TripFilters): number {
  return f.difficulties.length + f.durations.length + f.elevations.length + (f.favoritesOnly ? 1 : 0);
}

function matchBucket<T extends { id: string; min: number; max: number }>(
  value: number | undefined,
  selected: readonly string[],
  buckets: readonly T[],
  includeUnknown: boolean,
): boolean {
  if (selected.length === 0) return true;
  if (value == null) return includeUnknown;
  return buckets.some((b) => selected.includes(b.id) && value >= b.min && value < b.max);
}

export function applyFilters(trips: NearbyTrip[], f: TripFilters, favorites: ReadonlySet<string>): NearbyTrip[] {
  return trips.filter((t) => {
    if (f.favoritesOnly && !favorites.has(t.id)) return false;
    if (f.difficulties.length > 0) {
      if (!t.difficulty) {
        if (!f.includeUnknown) return false;
      } else if (!f.difficulties.includes(t.difficulty)) return false;
    }
    return (
      matchBucket(t.estimatedTimeMinutes, f.durations, DURATION_BUCKETS, f.includeUnknown) &&
      matchBucket(t.elevationGain, f.elevations, ELEVATION_BUCKETS, f.includeUnknown)
    );
  });
}
