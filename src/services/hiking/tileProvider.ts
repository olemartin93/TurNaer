/**
 * TileProvider — the main trip source.
 *
 * Trips are pre-built weekly by the "Update trip data" GitHub Actions workflow
 * (scripts/data/*) from Kartverket's national trail database (Turrutebasen) and
 * OpenStreetMap, and published with the site as static map-cell files:
 *
 *   data/tiles/index.json        list of cells
 *   data/tiles/<cell>.json       trip summaries (cell = floor(lat*2)_floor(lon))
 *   data/tiles/<cell>.geo.json   route geometry, loaded only when a trip is opened
 *
 * Loading static files from the site itself is fast, works offline (service worker)
 * and doesn't depend on busy public APIs. If the dataset hasn't been built yet,
 * this provider falls back to live OpenStreetMap queries via Overpass.
 */
import type { LineString, MultiLineString, Position } from "geojson";
import type { HikingProvider, NearbyOptions, ProviderResult } from "./provider";
import type { HikingTrip } from "@/types/trip";
import { withBasePath } from "@/lib/config";
import { ApiError, fetchJson } from "@/lib/http";
import { boundingBoxAround, calculateDistance } from "@/lib/geo/distance";

type TileIndex = { version: number; generatedAt: string; cells: string[] };

const LAT_STEP = 0.5;
const LON_STEP = 1;
const SEPARATOR = "~";

const cellKey = (lat: number, lon: number): string => `${Math.floor(lat / LAT_STEP)}_${Math.floor(lon / LON_STEP)}`;

export class TileProvider implements HikingProvider {
  readonly id = "tiles";
  readonly name = "TurNær trip data";
  private index: Promise<TileIndex | null> | null = null;
  private readonly cells = new Map<string, Promise<HikingTrip[]>>();
  private readonly geo = new Map<string, Promise<Record<string, Position[][]>>>();

  constructor(private readonly fallback: HikingProvider) {}

  isEnabled(): boolean {
    return true;
  }

  ownsTrip(tripId: string): boolean {
    return tripId.includes(SEPARATOR);
  }

  /** The dataset index, or null if no dataset is published (404). */
  private loadIndex(): Promise<TileIndex | null> {
    this.index ??= fetchJson<TileIndex>(withBasePath("/data/tiles/index.json"), { timeoutMs: 10000 })
      .then(({ data }) => (Array.isArray(data.cells) && data.cells.length > 0 ? data : null))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        this.index = null; // network problem: try again next time
        throw error;
      });
    return this.index;
  }

  private loadCell(cell: string, signal?: AbortSignal): Promise<HikingTrip[]> {
    let p = this.cells.get(cell);
    if (!p) {
      p = fetchJson<{ trips: HikingTrip[] }>(withBasePath(`/data/tiles/${cell}.json`), { signal, timeoutMs: 20000 })
        .then(({ data }) => data.trips ?? [])
        .catch((error: unknown) => {
          this.cells.delete(cell);
          throw error;
        });
      this.cells.set(cell, p);
    }
    return p;
  }

  private loadGeo(cell: string, signal?: AbortSignal): Promise<Record<string, Position[][]>> {
    let p = this.geo.get(cell);
    if (!p) {
      p = fetchJson<Record<string, Position[][]>>(withBasePath(`/data/tiles/${cell}.geo.json`), {
        signal,
        timeoutMs: 20000,
      })
        .then(({ data }) => data)
        .catch((error: unknown) => {
          this.geo.delete(cell);
          throw error;
        });
      this.geo.set(cell, p);
    }
    return p;
  }

  async getNearbyTrips(
    latitude: number,
    longitude: number,
    radiusKm: number,
    options: NearbyOptions = {},
  ): Promise<ProviderResult> {
    const index = await this.loadIndex();
    if (!index) return this.fallback.getNearbyTrips(latitude, longitude, radiusKm, options);

    const available = new Set(index.cells);
    // Trips are filed under the cell of their centre; pad the search box so a
    // route centred just outside the radius but reaching into it isn't missed.
    const bb = boundingBoxAround({ latitude, longitude }, radiusKm + 5);
    const wanted: string[] = [];
    for (let lat = Math.floor(bb.south / LAT_STEP); lat <= Math.floor(bb.north / LAT_STEP); lat++) {
      for (let lon = Math.floor(bb.west / LON_STEP); lon <= Math.floor(bb.east / LON_STEP); lon++) {
        const key = `${lat}_${lon}`;
        if (available.has(key)) wanted.push(key);
      }
    }

    const found: HikingTrip[] = [];
    let failures = 0;
    await Promise.all(
      wanted.map(async (cell) => {
        try {
          const trips = await this.loadCell(cell, options.signal);
          found.push(...trips.filter((t) => calculateDistance({ latitude, longitude }, t) <= radiusKm));
          if (!options.signal?.aborted) options.onPartial?.([...found]);
        } catch (error) {
          if (options.signal?.aborted) throw error;
          failures++;
        }
      }),
    );
    if (wanted.length > 0 && failures === wanted.length) throw new ApiError("Trip data could not be loaded");
    return { trips: found, incomplete: failures > 0 };
  }

  async getTripById(tripId: string, signal?: AbortSignal): Promise<HikingTrip | null> {
    const cell = tripId.split(SEPARATOR)[0] ?? "";
    if (!/^-?\d+_-?\d+$/.test(cell)) return null;
    const [trips, geo] = await Promise.all([
      this.loadCell(cell, signal),
      this.loadGeo(cell, signal).catch(() => ({}) as Record<string, Position[][]>),
    ]);
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return null;
    const lines = geo[tripId];
    const route: LineString | MultiLineString | undefined =
      lines && lines.length > 0
        ? lines.length === 1 && lines[0]
          ? { type: "LineString", coordinates: lines[0] }
          : { type: "MultiLineString", coordinates: lines }
        : undefined;
    return { ...trip, route };
  }
}

export { cellKey };
