import type { LineString, MultiLineString } from "geojson";

export type Difficulty = "easy" | "moderate" | "hard" | "expert";

export type TripSource = "morotur" | "ut" | "osm" | "turrutebasen" | "other";

/**
 * - route: a described/waymarked hiking route (e.g. an OSM route relation or a Morotur trip)
 * - trail: a named path, possibly made of several mapped segments
 * - summit: a named peak – a hiking destination without route data
 */
export type TripKind = "route" | "trail" | "summit";

/**
 * Normalised internal trip model. Every provider maps its own data into this
 * shape so the UI never depends on a specific source.
 *
 * Fields are optional whenever a source may not provide them: the UI shows
 * "unknown" rather than inventing values.
 */
export type HikingTrip = {
  id: string;
  name: string;
  description?: string;
  /** Representative position of the trip (see `positionKind`). */
  latitude: number;
  longitude: number;
  kind: TripKind;
  /** Whether latitude/longitude is the trailhead, the route's centre, or the destination itself. */
  positionKind: "start" | "center" | "destination";
  /** Height of a summit in metres above sea level, as stated by the source. */
  summitElevationM?: number;
  /** Length of the route itself in km (not the distance from the user). */
  lengthKm?: number;
  /** True when lengthKm was measured from route geometry rather than stated by the source. */
  lengthIsMeasured?: boolean;
  elevationGain?: number;
  /** True when elevationGain was calculated from Kartverket terrain samples. */
  elevationGainIsMeasured?: boolean;
  difficulty?: Difficulty;
  /** Where the difficulty came from, for transparency (e.g. "OSM sac_scale"). */
  difficultySource?: string;
  estimatedTimeMinutes?: number;
  /** True when the duration is our own estimate rather than stated by the source. */
  estimatedTimeIsCalculated?: boolean;
  source: TripSource;
  /** Human readable name of the site behind `sourceUrl`, e.g. "OpenStreetMap", "Morotur". */
  sourceLabel: string;
  /** Where the trip data itself came from (may differ from the linked page), e.g. "OpenStreetMap". */
  dataProvider: string;
  /** Authoritative page for the trip. Always a real URL from the source data. */
  sourceUrl: string;
  /** Additional official page (e.g. the `website` tag on an OSM route). */
  websiteUrl?: string;
  route?: LineString | MultiLineString;
  imageUrl?: string;
  /** Free-form extra facts from the source, shown in the detail view. */
  operator?: string;
  /** Waymarked in the terrain, according to the source. */
  marked?: boolean;
  network?: string;
  ref?: string;
};

/** A trip together with values computed relative to the user. */
export type NearbyTrip = HikingTrip & {
  /** Approximate straight-line distance from the user, in km. */
  distanceFromUserKm: number | null;
};
