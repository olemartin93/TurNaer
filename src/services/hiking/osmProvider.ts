/**
 * OpenStreetMapProvider — real hiking routes from OpenStreetMap via Overpass.
 *
 * Uses route relations tagged type=route + route=hiking|foot that have a name.
 * When a route carries a `website`/`url` tag pointing at Morotur or UT.no, that
 * page is used as the trip link; otherwise the OSM relation page is linked.
 */
import type { LineString, MultiLineString, Position } from "geojson";
import type { HikingProvider } from "./provider";
import type { HikingTrip } from "@/types/trip";
import { runOverpassQuery, type OverpassElement } from "@/services/osm/overpass";
import { boundingBoxAround, calculateDistance } from "@/lib/geo/distance";
import { readCache, writeCache } from "@/lib/cache";
import { difficultyFromSacScale, parseDistanceKm, parseDurationMinutes, safeUrl, sourceFromUrl } from "@/lib/trips/parse";

const ID_PREFIX = "osm-r";
const MAX_RESULTS = 600;
/** Skip long-distance routes whose extent is larger than this (they are not day trips). */
const MAX_EXTENT_KM = 80;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function toTrip(el: OverpassElement): HikingTrip | null {
  const tags = el.tags ?? {};
  const name = tags.name ?? tags["name:nb"] ?? tags["name:nn"] ?? tags["name:no"];
  if (!name) return null;

  let latitude: number | undefined;
  let longitude: number | undefined;
  if (el.bounds) {
    const extent = calculateDistance(
      { latitude: el.bounds.minlat, longitude: el.bounds.minlon },
      { latitude: el.bounds.maxlat, longitude: el.bounds.maxlon },
    );
    if (extent > MAX_EXTENT_KM) return null;
    latitude = (el.bounds.minlat + el.bounds.maxlat) / 2;
    longitude = (el.bounds.minlon + el.bounds.maxlon) / 2;
  } else if (el.center) {
    latitude = el.center.lat;
    longitude = el.center.lon;
  }
  if (latitude == null || longitude == null) return null;

  const osmUrl = `https://www.openstreetmap.org/relation/${el.id}`;
  const website = safeUrl(tags.website ?? tags.url ?? tags["contact:website"]);
  const known = website ? sourceFromUrl(website) : null;
  const durationMinutes = parseDurationMinutes(tags.duration);
  const difficulty = difficultyFromSacScale(tags.sac_scale);

  return {
    id: `${ID_PREFIX}${el.id}`,
    name,
    description: tags.description ?? tags["description:nb"] ?? tags["description:en"],
    latitude,
    longitude,
    positionKind: "center",
    lengthKm: parseDistanceKm(tags.distance),
    difficulty,
    difficultySource: difficulty ? "OpenStreetMap sac_scale tag" : undefined,
    estimatedTimeMinutes: durationMinutes,
    estimatedTimeIsCalculated: durationMinutes == null ? undefined : false,
    source: known?.source ?? "osm",
    sourceLabel: known?.label ?? "OpenStreetMap",
    sourceUrl: known && website ? website : osmUrl,
    websiteUrl: website && !known ? website : undefined,
    dataProvider: "OpenStreetMap",
    imageUrl: safeUrl(tags.image),
    operator: tags.operator,
    network: tags.network,
    ref: tags.ref,
  };
}

function toRoute(el: OverpassElement): LineString | MultiLineString | undefined {
  const lines: Position[][] = (el.members ?? [])
    .filter((m) => m.type === "way" && m.geometry && m.geometry.length >= 2)
    .map((m) => (m.geometry ?? []).map((g) => [g.lon, g.lat]));
  if (lines.length === 0) return undefined;
  return lines.length === 1 && lines[0]
    ? { type: "LineString", coordinates: lines[0] }
    : { type: "MultiLineString", coordinates: lines };
}

export class OpenStreetMapProvider implements HikingProvider {
  readonly id = "osm";
  readonly name = "OpenStreetMap";

  isEnabled(): boolean {
    return true;
  }

  ownsTrip(tripId: string): boolean {
    return tripId.startsWith(ID_PREFIX);
  }

  async getNearbyTrips(latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal) {
    // Round the query area so nearby searches share the cache (and the Overpass load stays low).
    const lat = Math.round(latitude * 50) / 50;
    const lon = Math.round(longitude * 50) / 50;
    const cacheKey = `trips:osm:${lat},${lon},${radiusKm}`;
    const cached = readCache<HikingTrip[]>(cacheKey);
    if (cached) return cached;

    const bb = boundingBoxAround({ latitude: lat, longitude: lon }, radiusKm + 2);
    const bbox = [bb.south, bb.west, bb.north, bb.east].map((n) => n.toFixed(4)).join(",");
    const query = `[out:json][timeout:30];relation["type"="route"]["route"~"^(hiking|foot)$"]["name"](${bbox});out tags bb ${MAX_RESULTS};`;
    try {
      const elements = await runOverpassQuery(query, signal);
      const trips = elements.map(toTrip).filter((t): t is HikingTrip => t !== null);
      writeCache(cacheKey, trips, CACHE_TTL_MS);
      return trips;
    } catch (error) {
      const stale = readCache<HikingTrip[]>(cacheKey, { allowExpired: true });
      if (stale) return stale;
      throw error;
    }
  }

  async getTripById(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null> {
    const id = Number(tripId.slice(ID_PREFIX.length));
    if (!Number.isInteger(id) || id <= 0) return null;
    const cacheKey = `trip:${tripId}`;
    const cached = readCache<HikingTrip>(cacheKey);
    if (cached) return cached;
    try {
      const elements = await runOverpassQuery(`[out:json][timeout:30];relation(${id});out geom;`, signal);
      const el = elements.find((e) => e.type === "relation" && e.id === id);
      if (!el) return null;
      const route = toRoute(el);
      // `out geom` returns the relation's bounds too, so toTrip can compute the centre.
      const base = toTrip(el);
      if (!base) return null;
      const trip: HikingTrip = { ...base, route };
      writeCache(cacheKey, trip, 7 * 24 * 60 * 60 * 1000);
      return trip;
    } catch (error) {
      const stale = readCache<HikingTrip>(cacheKey, { allowExpired: true });
      if (stale) return stale;
      throw error;
    }
  }
}
