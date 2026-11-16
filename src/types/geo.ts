export type LatLon = {
  latitude: number;
  longitude: number;
};

export type UserLocation = LatLon & {
  /** Accuracy radius in metres, when known (browser geolocation). */
  accuracyM?: number;
  /** Human readable label, e.g. a place name from Kartverket. */
  label?: string;
  origin: "gps" | "search" | "map" | "cache";
};

export type BoundingBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};
