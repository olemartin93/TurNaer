import type { Difficulty, TripSource } from "@/types/trip";

/** Parse distance tags like "5", "5.2 km", "5,2km", "3200 m" into km. */
export function parseDistanceKm(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = value.trim().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(km|m|mi)?$/i);
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  const unit = (m[2] ?? "km").toLowerCase();
  const km = unit === "m" ? n / 1000 : unit === "mi" ? n * 1.609344 : n;
  return Number.isFinite(km) && km > 0 ? km : undefined;
}

/** Parse OSM `duration` values: "HH:MM", "HH:MM:SS", "MM" or ISO 8601 ("PT2H30M"). */
export function parseDurationMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const iso = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (iso && v.length > 1) {
    const total = Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
    return total > 0 ? total : undefined;
  }
  const hm = v.match(/^(\d+):(\d{1,2})(?::\d{1,2})?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const mins = v.match(/^\d+$/);
  return mins ? Number(v) : undefined;
}

/**
 * Map the OSM `sac_scale` tag to our difficulty scale. This is only used when a
 * route relation carries the tag itself; we never guess a difficulty.
 */
export function difficultyFromSacScale(value: string | undefined): Difficulty | undefined {
  switch (value) {
    case "hiking":
      return "easy";
    case "mountain_hiking":
      return "moderate";
    case "demanding_mountain_hiking":
      return "hard";
    case "alpine_hiking":
    case "demanding_alpine_hiking":
    case "difficult_alpine_hiking":
      return "expert";
    default:
      return undefined;
  }
}

/** Accept only absolute http(s) URLs from source data. */
export function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Identify well-known Norwegian hiking sites by URL. */
export function sourceFromUrl(url: string): { source: TripSource; label: string } | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host === "morotur.no" || host.endsWith(".morotur.no")) return { source: "morotur", label: "Morotur" };
  if (host === "ut.no" || host.endsWith(".ut.no")) return { source: "ut", label: "UT.no" };
  return null;
}
