/**
 * Overpass API client for OpenStreetMap data (© OpenStreetMap contributors, ODbL).
 *
 * The public instance (overpass-api.de) is free and CORS-enabled, with a fair-use
 * policy (well under 10 000 requests/day, modest query sizes). We keep queries
 * small, set explicit timeouts and cache results in the browser.
 */
import { config } from "@/lib/config";
import { ApiError, fetchJson, isAbortError } from "@/lib/http";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  members?: {
    type: "node" | "way" | "relation";
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
};

type OverpassResponse = { elements?: OverpassElement[]; remark?: string };

export async function runOverpassQuery(query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  let lastError: unknown = new ApiError("No Overpass endpoint configured");
  for (const endpoint of config.osm.overpassUrls) {
    try {
      // GET (not POST) so the service worker can keep a copy for offline use.
      const { data } = await fetchJson<OverpassResponse>(`${endpoint}?${new URLSearchParams({ data: query })}`, {
        signal,
        timeoutMs: 40000,
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
