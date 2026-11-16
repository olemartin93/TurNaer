import type { BoundingBox, LatLon } from "@/types/geo";

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates using the Haversine formula.
 * This is a straight-line ("as the crow flies") distance, NOT a hiking distance.
 */
export function calculateDistance(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box that contains a circle of `radiusKm` around `center`. */
export function boundingBoxAround(center: LatLon, radiusKm: number): BoundingBox {
  const dLat = radiusKm / 111.32;
  const cosLat = Math.max(0.01, Math.cos(toRad(center.latitude)));
  const dLon = radiusKm / (111.32 * cosLat);
  return {
    south: center.latitude - dLat,
    north: center.latitude + dLat,
    west: center.longitude - dLon,
    east: center.longitude + dLon,
  };
}

/** Length of a polyline given as [lon, lat] positions, in km. */
export function lineLengthKm(positions: ReadonlyArray<readonly number[]>): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const p = positions[i - 1];
    const q = positions[i];
    if (!p || !q) continue;
    total += calculateDistance(
      { latitude: p[1] ?? 0, longitude: p[0] ?? 0 },
      { latitude: q[1] ?? 0, longitude: q[0] ?? 0 },
    );
  }
  return total;
}
