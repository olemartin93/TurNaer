/**
 * OpenStreetMapProvider — real hiking trips from OpenStreetMap via Overpass.
 *
 * Three kinds of OSM data are turned into trips:
 * 1. Route relations (type=route + route=hiking|foot) with a name – waymarked/described routes.
 * 2. Named trails: ways tagged highway=path with a name, or any highway with a name and
 *    sac_scale. Segments with the same name that touch each other are merged into one trip.
 *    (Most Norwegian hiking paths are mapped like this rather than as route relations.)
 * 3. Named summits (natural=peak) – popular hiking destinations, without route data.
 *
 * When a feature carries a `website`/`url` tag pointing at Morotur or UT.no, that page
 * is used as the trip link; otherwise the OSM page for the feature is linked.
 */
import type { LineString, MultiLineString, Position } from "geojson";
import type { HikingProvider } from "./provider";
import type { HikingTrip, TripKind } from "@/types/trip";
import { runOverpassQuery, type OverpassElement } from "@/services/osm/overpass";
import { boundingBoxAround, calculateDistance } from "@/lib/geo/distance";
import { readCache, writeCache } from "@/lib/cache";
import {
  difficultyFromSacScale,
  parseDistanceKm,
  parseDurationMinutes,
  safeUrl,
  sourceFromUrl,
} from "@/lib/trips/parse";

const RELATION_PREFIX = "osm-r";
const TRAIL_PREFIX = "osm-w";
const SUMMIT_PREFIX = "osm-n";
/** Skip long-distance routes whose extent is larger than this (they are not day trips). */
const MAX_EXTENT_KM = 80;
/** Trail segments with the same name closer than this are treated as one trail. */
const TRAIL_JOIN_KM = 0.3;
/** Max way ids encoded in a trail id (keeps shareable URLs reasonable). */
const MAX_WAYS_PER_TRAIL = 40;
const CACHE_VERSION = "v2";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/** Empty answers are cached briefly only, so a temporary glitch doesn't stick. */
const EMPTY_CACHE_TTL_MS = 10 * 60 * 1000;

type Bounds = NonNullable<OverpassElement["bounds"]>;

const nameOf = (tags: Record<string, string>): string | undefined =>
  tags.name ?? tags["name:nb"] ?? tags["name:nn"] ?? tags["name:no"];

const extentKm = (b: Bounds): number =>
  calculateDistance({ latitude: b.minlat, longitude: b.minlon }, { latitude: b.maxlat, longitude: b.maxlon });

function linkFields(tags: Record<string, string>, osmUrl: string) {
  const website = safeUrl(tags.website ?? tags.url ?? tags["contact:website"]);
  const known = website ? sourceFromUrl(website) : null;
  return {
    source: known?.source ?? ("osm" as const),
    sourceLabel: known?.label ?? "OpenStreetMap",
    sourceUrl: known && website ? website : osmUrl,
    websiteUrl: website && !known ? website : undefined,
    dataProvider: "OpenStreetMap",
  };
}

function commonFields(tags: Record<string, string>) {
  const durationMinutes = parseDurationMinutes(tags.duration);
  const difficulty = difficultyFromSacScale(tags.sac_scale);
  return {
    description: tags.description ?? tags["description:nb"] ?? tags["description:no"] ?? tags["description:en"],
    lengthKm: parseDistanceKm(tags.distance),
    difficulty,
    difficultySource: difficulty ? "OpenStreetMap sac_scale tag" : undefined,
    estimatedTimeMinutes: durationMinutes,
    estimatedTimeIsCalculated: durationMinutes == null ? undefined : false,
    imageUrl: safeUrl(tags.image),
    operator: tags.operator,
    network: tags.network,
    ref: tags.ref,
  };
}

function relationToTrip(el: OverpassElement): HikingTrip | null {
  const tags = el.tags ?? {};
  const name = nameOf(tags);
  if (!name || !el.bounds || extentKm(el.bounds) > MAX_EXTENT_KM) return null;
  return {
    id: `${RELATION_PREFIX}${el.id}`,
    name,
    kind: "route",
    latitude: (el.bounds.minlat + el.bounds.maxlat) / 2,
    longitude: (el.bounds.minlon + el.bounds.maxlon) / 2,
    positionKind: "center",
    ...commonFields(tags),
    ...linkFields(tags, `https://www.openstreetmap.org/relation/${el.id}`),
  };
}

function summitToTrip(el: OverpassElement): HikingTrip | null {
  const tags = el.tags ?? {};
  const name = nameOf(tags);
  if (!name || el.lat == null || el.lon == null) return null;
  const ele = Number((tags.ele ?? "").replace(",", ".").replace(/\s*m$/i, ""));
  return {
    id: `${SUMMIT_PREFIX}${el.id}`,
    name,
    kind: "summit",
    latitude: el.lat,
    longitude: el.lon,
    positionKind: "destination",
    summitElevationM: Number.isFinite(ele) && ele > 0 ? ele : undefined,
    description: tags.description,
    imageUrl: safeUrl(tags.image),
    ...linkFields(tags, `https://www.openstreetmap.org/node/${el.id}`),
  };
}

function boundsTouch(a: Bounds, b: Bounds, marginKm: number): boolean {
  const dLat = marginKm / 111.32;
  const dLon = marginKm / (111.32 * Math.cos((((a.minlat + a.maxlat) / 2) * Math.PI) / 180));
  return !(
    a.maxlat + dLat < b.minlat ||
    b.maxlat + dLat < a.minlat ||
    a.maxlon + dLon < b.minlon ||
    b.maxlon + dLon < a.minlon
  );
}

const mergeBounds = (a: Bounds, b: Bounds): Bounds => ({
  minlat: Math.min(a.minlat, b.minlat),
  minlon: Math.min(a.minlon, b.minlon),
  maxlat: Math.max(a.maxlat, b.maxlat),
  maxlon: Math.max(a.maxlon, b.maxlon),
});

/** Merge named path segments into trails (same name + touching extents). */
function waysToTrails(ways: OverpassElement[]): HikingTrip[] {
  type Group = { name: string; ways: OverpassElement[]; bounds: Bounds };
  const byName = new Map<string, Group[]>();
  for (const way of ways) {
    const name = nameOf(way.tags ?? {});
    if (!name || !way.bounds) continue;
    const key = name.trim().toLowerCase();
    const groups = byName.get(key) ?? [];
    let target = groups.find((g) => boundsTouch(g.bounds, way.bounds as Bounds, TRAIL_JOIN_KM));
    if (target) {
      target.ways.push(way);
      target.bounds = mergeBounds(target.bounds, way.bounds);
      // The grown group may now touch other groups with the same name: merge them in.
      for (let i = groups.length - 1; i >= 0; i--) {
        const other = groups[i];
        if (!other || other === target || !boundsTouch(target.bounds, other.bounds, TRAIL_JOIN_KM)) continue;
        target.ways.push(...other.ways);
        target.bounds = mergeBounds(target.bounds, other.bounds);
        groups.splice(i, 1);
      }
    } else {
      target = { name, ways: [way], bounds: way.bounds };
      groups.push(target);
    }
    byName.set(key, groups);
  }

  const trails: HikingTrip[] = [];
  for (const groups of byName.values()) {
    for (const g of groups) {
      if (extentKm(g.bounds) > MAX_EXTENT_KM) continue;
      const ids = g.ways.map((w) => w.id).sort((a, b) => a - b);
      const first = g.ways.find((w) => w.id === ids[0]) ?? g.ways[0];
      const tags = first?.tags ?? {};
      // Prefer the hardest sac_scale among the segments, if any are tagged.
      const scales = g.ways.map((w) => difficultyFromSacScale(w.tags?.sac_scale)).filter(Boolean);
      const order = ["easy", "moderate", "hard", "expert"] as const;
      const hardest = scales.sort((a, b) => order.indexOf(b ?? "easy") - order.indexOf(a ?? "easy"))[0];
      const common = commonFields(tags);
      trails.push({
        id: `${TRAIL_PREFIX}${ids.slice(0, MAX_WAYS_PER_TRAIL).join("_")}`,
        name: g.name,
        kind: "trail",
        latitude: (g.bounds.minlat + g.bounds.maxlat) / 2,
        longitude: (g.bounds.minlon + g.bounds.maxlon) / 2,
        positionKind: "center",
        ...common,
        difficulty: hardest ?? undefined,
        difficultySource: hardest ? "OpenStreetMap sac_scale tag" : undefined,
        ...linkFields(tags, `https://www.openstreetmap.org/way/${ids[0]}`),
      });
    }
  }
  return trails;
}

function toRoute(lines: Position[][]): LineString | MultiLineString | undefined {
  if (lines.length === 0) return undefined;
  return lines.length === 1 && lines[0]
    ? { type: "LineString", coordinates: lines[0] }
    : { type: "MultiLineString", coordinates: lines };
}

const relationLines = (el: OverpassElement): Position[][] =>
  (el.members ?? [])
    .filter((m) => m.type === "way" && m.geometry && m.geometry.length >= 2)
    .map((m) => (m.geometry ?? []).map((g) => [g.lon, g.lat]));

const wayLines = (els: OverpassElement[]): Position[][] =>
  els.filter((e) => e.geometry && e.geometry.length >= 2).map((e) => (e.geometry ?? []).map((g) => [g.lon, g.lat]));

export class OpenStreetMapProvider implements HikingProvider {
  readonly id = "osm";
  readonly name = "OpenStreetMap";

  isEnabled(): boolean {
    return true;
  }

  ownsTrip(tripId: string): boolean {
    return [RELATION_PREFIX, TRAIL_PREFIX, SUMMIT_PREFIX].some((p) => tripId.startsWith(p));
  }

  async getNearbyTrips(latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal) {
    // Round the query area so nearby searches share the cache (and the Overpass load stays low).
    const lat = Math.round(latitude * 50) / 50;
    const lon = Math.round(longitude * 50) / 50;
    const cacheKey = `trips:osm:${CACHE_VERSION}:${lat},${lon},${radiusKm}`;
    const cached = readCache<HikingTrip[]>(cacheKey);
    if (cached) return cached;

    const bb = boundingBoxAround({ latitude: lat, longitude: lon }, radiusKm + 2);
    const bbox = [bb.south, bb.west, bb.north, bb.east].map((n) => n.toFixed(4)).join(",");
    // Bigger areas get lower per-kind caps to keep responses small.
    const cap = radiusKm > 50 ? 400 : 800;
    const query =
      `[out:json][timeout:45];` +
      `relation["type"="route"]["route"~"^(hiking|foot)$"]["name"](${bbox});out tags bb ${cap};` +
      `(way["highway"="path"]["name"](${bbox});way["highway"]["sac_scale"]["name"](${bbox}););out tags bb ${cap * 3};` +
      `node["natural"="peak"]["name"](${bbox});out body ${cap};`;
    try {
      const elements = await runOverpassQuery(query, signal);
      const relations = elements.filter((e) => e.type === "relation").map(relationToTrip);
      const summits = elements.filter((e) => e.type === "node").map(summitToTrip);
      const trails = waysToTrails(elements.filter((e) => e.type === "way"));
      const trips = [...relations, ...trails, ...summits].filter((t): t is HikingTrip => t !== null);
      writeCache(cacheKey, trips, trips.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS);
      return trips;
    } catch (error) {
      const stale = readCache<HikingTrip[]>(cacheKey, { allowExpired: true });
      if (stale) return stale;
      throw error;
    }
  }

  async getTripById(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null> {
    const cacheKey = `trip:${CACHE_VERSION}:${tripId}`;
    const cached = readCache<HikingTrip>(cacheKey);
    if (cached) return cached;
    try {
      const trip = await this.fetchTrip(tripId, signal);
      if (trip) writeCache(cacheKey, trip, 7 * 24 * 60 * 60 * 1000);
      return trip;
    } catch (error) {
      const stale = readCache<HikingTrip>(cacheKey, { allowExpired: true });
      if (stale) return stale;
      throw error;
    }
  }

  private async fetchTrip(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null> {
    const kind: TripKind | null = tripId.startsWith(RELATION_PREFIX)
      ? "route"
      : tripId.startsWith(TRAIL_PREFIX)
        ? "trail"
        : tripId.startsWith(SUMMIT_PREFIX)
          ? "summit"
          : null;
    const rest = tripId.slice(5);
    const ids = rest.split("_").map(Number);
    if (!kind || ids.length === 0 || ids.some((n) => !Number.isInteger(n) || n <= 0)) return null;

    if (kind === "route") {
      const elements = await runOverpassQuery(`[out:json][timeout:30];relation(${ids[0]});out geom;`, signal);
      const el = elements.find((e) => e.type === "relation");
      const base = el ? relationToTrip(el) : null;
      return base && el ? { ...base, route: toRoute(relationLines(el)) } : null;
    }
    if (kind === "summit") {
      const elements = await runOverpassQuery(`[out:json][timeout:30];node(${ids[0]});out body;`, signal);
      const el = elements.find((e) => e.type === "node");
      return el ? summitToTrip(el) : null;
    }
    const elements = await runOverpassQuery(
      `[out:json][timeout:30];way(id:${ids.slice(0, MAX_WAYS_PER_TRAIL).join(",")});out geom;`,
      signal,
    );
    const ways = elements.filter((e) => e.type === "way");
    const [trail] = waysToTrails(ways);
    if (!trail) return null;
    // Keep the id that was requested so links and favourites stay stable.
    return { ...trail, id: tripId, route: toRoute(wayLines(ways)) };
  }
}
