/**
 * Overpass API client for OpenStreetMap data (© OpenStreetMap contributors, ODbL).
 *
 * Public instances are free and CORS-enabled, with fair-use policies (modest numbers
 * of requests and query sizes). We keep queries small, set explicit timeouts, cache
 * results in the browser, and fall back to the next instance when one is busy.
 */
import { config } from "@/lib/config";
import { ApiError, fetchJson, isAbortError } from "@/lib/http";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  /** Node coordinates (with `out body`). */
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  /** Way geometry (with `out geom`). */
  geometry?: { lat: number; lon: number }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  members?: {
    type: "node" | "way" | "relation";
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
};

type OverpassResponse = { elements?: OverpassElement[]; remark?: string };

export type OverpassOptions = {
  signal?: AbortSignal;
  /** Index of the instance to try first, so parallel queries spread over instances. */
  startAt?: number;
  /** How many instances to try before giving up. */
  maxAttempts?: number;
  /** Client-side limit per attempt. Busy instances can queue requests for a long time. */
  timeoutMs?: number;
};

export async function runOverpassQuery(query: string, options: OverpassOptions = {}): Promise<OverpassElement[]> {
  const { signal, startAt = 0, maxAttempts = 2, timeoutMs = 30000 } = options;
  const urls = config.osm.overpassUrls;
  let lastError: unknown = new ApiError("No Overpass endpoint configured");
  for (let attempt = 0; attempt < Math.min(maxAttempts, urls.length); attempt++) {
    const endpoint = urls[(startAt + attempt) % urls.length];
    if (!endpoint) continue;
    try {
      // GET (not POST) so the service worker can keep a copy for offline use.
      const { data } = await fetchJson<OverpassResponse>(`${endpoint}?${new URLSearchParams({ data: query })}`, {
        signal,
        timeoutMs,
      });
      if (data.remark && /runtime error|timed out/i.test(data.remark) && !data.elements?.length) {
        throw new ApiError(`Overpass: ${data.remark}`);
      }
      return data.elements ?? [];
    } catch (error) {
      if (isAbortError(error) && signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
