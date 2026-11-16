import type { LineString, MultiLineString, Position } from "geojson";
import { calculateDistance, lineLengthKm } from "./distance";
import type { LatLon } from "@/types/geo";

const samePoint = (a: Position | undefined, b: Position | undefined): boolean =>
  !!a && !!b && Math.abs((a[0] ?? 0) - (b[0] ?? 0)) < 1e-7 && Math.abs((a[1] ?? 0) - (b[1] ?? 0)) < 1e-7;

/**
 * OSM route relations consist of many ways in arbitrary order and direction.
 * Greedily join ways that share end points into continuous chains.
 */
export function chainSegments(segments: Position[][]): Position[][] {
  const remaining = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const chains: Position[][] = [];
  while (remaining.length > 0) {
    const chain = remaining.shift() ?? [];
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        if (!seg) continue;
        const head = chain[0];
        const tail = chain[chain.length - 1];
        const segHead = seg[0];
        const segTail = seg[seg.length - 1];
        if (samePoint(tail, segHead)) chain.push(...seg.slice(1));
        else if (samePoint(tail, segTail)) chain.push(...[...seg].reverse().slice(1));
        else if (samePoint(head, segTail)) chain.unshift(...seg.slice(0, -1));
        else if (samePoint(head, segHead)) chain.unshift(...[...seg].reverse().slice(0, -1));
        else continue;
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains.sort((a, b) => lineLengthKm(b) - lineLengthKm(a));
}

export function routeLines(route: LineString | MultiLineString): Position[][] {
  return route.type === "LineString" ? [route.coordinates] : route.coordinates;
}

/** The longest continuous line of a route, used for the elevation profile. */
export function mainLine(route: LineString | MultiLineString): Position[] {
  return chainSegments(routeLines(route))[0] ?? [];
}

export function routeLengthKm(route: LineString | MultiLineString): number {
  return routeLines(route).reduce((sum, line) => sum + lineLengthKm(line), 0);
}

/** Point on the route closest to `point` (vertex-based approximation). */
export function nearestPointOnRoute(
  route: LineString | MultiLineString,
  point: LatLon,
): { position: LatLon; distanceKm: number } | null {
  let best: { position: LatLon; distanceKm: number } | null = null;
  for (const line of routeLines(route)) {
    for (const p of line) {
      const candidate = { latitude: p[1] ?? 0, longitude: p[0] ?? 0 };
      const d = calculateDistance(point, candidate);
      if (!best || d < best.distanceKm) best = { position: candidate, distanceKm: d };
    }
  }
  return best;
}

/**
 * Resample a polyline at `count` points evenly spaced along its length.
 * Returns positions with their cumulative distance (km) from the start.
 */
export function resampleLine(line: Position[], count: number): { position: Position; distanceKm: number }[] {
  if (line.length < 2) return [];
  const cumulative: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1] ?? [0, 0];
    const q = line[i] ?? [0, 0];
    cumulative.push(
      (cumulative[i - 1] ?? 0) +
        calculateDistance({ latitude: p[1] ?? 0, longitude: p[0] ?? 0 }, { latitude: q[1] ?? 0, longitude: q[0] ?? 0 }),
    );
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (total === 0) return [];
  const result: { position: Position; distanceKm: number }[] = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (seg < line.length - 1 && (cumulative[seg] ?? 0) < target) seg++;
    const d0 = cumulative[seg - 1] ?? 0;
    const d1 = cumulative[seg] ?? d0;
    const t = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const p = line[seg - 1] ?? [0, 0];
    const q = line[seg] ?? p;
    result.push({
      position: [(p[0] ?? 0) + ((q[0] ?? 0) - (p[0] ?? 0)) * t, (p[1] ?? 0) + ((q[1] ?? 0) - (p[1] ?? 0)) * t],
      distanceKm: target,
    });
  }
  return result;
}
