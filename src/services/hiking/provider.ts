import type { HikingTrip } from "@/types/trip";

export type ProviderResult = {
  trips: HikingTrip[];
  /** True when part of the provider's data could not be loaded. */
  incomplete?: boolean;
};

export type NearbyOptions = {
  signal?: AbortSignal;
  /** Called with the trips found so far, for providers that load in several steps. */
  onPartial?: (trips: HikingTrip[]) => void;
};

/**
 * A source of hiking trips. Implementations map their own data into the
 * normalised `HikingTrip` model so new sources can be added without touching the UI.
 */
export interface HikingProvider {
  /** Stable identifier, also used as the prefix of trip ids ("osm-r123"). */
  readonly id: string;
  readonly name: string;
  /** Disabled providers are skipped (e.g. no dataset configured yet). */
  isEnabled(): boolean;
  getNearbyTrips(latitude: number, longitude: number, radiusKm: number, options?: NearbyOptions): Promise<ProviderResult>;
  /** Whether this provider owns a trip id (for shareable links). */
  ownsTrip?(tripId: string): boolean;
  /** Look up one trip by id, with as much detail (route geometry) as available. */
  getTripById?(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null>;
}
