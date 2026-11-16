/**
 * DatasetProvider — loads trips from a static JSON file served with the app
 * (e.g. public/data/trips.json). This is the extension point for sources that
 * do not offer a browser-accessible API: export their data (with permission)
 * into the documented format and drop the file in public/data/.
 *
 * File format: { "trips": HikingTrip[] } — see docs in README.md.
 */
import type { HikingProvider } from "./provider";
import type { HikingTrip, TripSource } from "@/types/trip";
import { withBasePath } from "@/lib/config";
import { calculateDistance } from "@/lib/geo/distance";
import { fetchJson } from "@/lib/http";
import { safeUrl } from "@/lib/trips/parse";

type DatasetFile = { trips?: Partial<HikingTrip>[] };

const DIFFICULTIES = new Set(["easy", "moderate", "hard", "expert"]);
const SOURCES = new Set<TripSource>(["morotur", "ut", "osm", "other"]);
const LABELS: Record<TripSource, string> = { morotur: "Morotur", ut: "UT.no", osm: "OpenStreetMap", other: "External site" };

function normalise(raw: Partial<HikingTrip>, providerId: string, datasetName: string): HikingTrip | null {
  const sourceUrl = safeUrl(raw.sourceUrl);
  if (
    !raw.id ||
    !raw.name ||
    typeof raw.latitude !== "number" ||
    typeof raw.longitude !== "number" ||
    !sourceUrl
  ) {
    return null; // never show a trip without a real link to its source
  }
  const source: TripSource = raw.source && SOURCES.has(raw.source) ? raw.source : "other";
  return {
    ...raw,
    id: `${providerId}-${raw.id}`,
    name: raw.name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    positionKind: raw.positionKind ?? "start",
    difficulty: raw.difficulty && DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : undefined,
    source,
    sourceLabel: raw.sourceLabel ?? LABELS[source],
    sourceUrl,
    dataProvider: raw.dataProvider ?? datasetName,
    imageUrl: safeUrl(raw.imageUrl),
  };
}

export class DatasetProvider implements HikingProvider {
  private cache: Promise<HikingTrip[]> | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly path: string,
    private readonly enabled: boolean = true,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  ownsTrip(tripId: string): boolean {
    return tripId.startsWith(`${this.id}-`);
  }

  private load(): Promise<HikingTrip[]> {
    this.cache ??= fetchJson<DatasetFile>(withBasePath(this.path))
      .then(({ data }) =>
        (data.trips ?? []).map((t) => normalise(t, this.id, this.name)).filter((t): t is HikingTrip => t !== null),
      )
      .catch((error: unknown) => {
        this.cache = null;
        throw error;
      });
    return this.cache;
  }

  async getNearbyTrips(latitude: number, longitude: number, radiusKm: number): Promise<HikingTrip[]> {
    const trips = await this.load();
    return trips.filter((t) => calculateDistance({ latitude, longitude }, t) <= radiusKm);
  }

  async getTripById(tripId: string): Promise<HikingTrip | null> {
    const trips = await this.load();
    return trips.find((t) => t.id === tripId) ?? null;
  }
}
