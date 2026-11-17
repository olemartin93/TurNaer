// Merges Kartverket Turrutebasen routes and OpenStreetMap hiking data into
// static map-cell files that the app loads at runtime:
//
//   public/data/tiles/index.json        – cell list, sources, generation time
//   public/data/tiles/<cell>.json       – trip summaries (normalised HikingTrip, no geometry)
//   public/data/tiles/<cell>.geo.json   – simplified route geometry per trip id
//
// Cells are 0.5° lat x 1° lon; a trip belongs to the cell containing its centre.
// Inputs (either may be missing): data-build/turrutebasen.json, data-build/osm.ndjson
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  bboxExtentKm,
  bboxOf,
  chainLines,
  clusterByProximity,
  haversineKm,
  lineLengthKm,
  norgeskartUrl,
  round5,
  simplify,
} from "./geo.mjs";

const OUT = process.env.TILES_OUT_DIR || "public/data/tiles";
const MAX_EXTENT_KM = 80;
const SIMPLIFY_M = 8;
const DEDUPE_KM = 3;

const norm = (s) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const shortHash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);
const cellOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon)}`;
const center = (b) => [(b.minLon + b.maxLon) / 2, (b.minLat + b.maxLat) / 2];

function safeUrl(value) {
  if (!value) return undefined;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function knownSite(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "morotur.no" || host.endsWith(".morotur.no")) return { source: "morotur", label: "Morotur" };
    if (host === "ut.no" || host.endsWith(".ut.no")) return { source: "ut", label: "UT.no" };
  } catch {
    // ignore
  }
  return null;
}

const SAC = {
  hiking: "easy",
  mountain_hiking: "moderate",
  demanding_mountain_hiking: "hard",
  alpine_hiking: "expert",
  demanding_alpine_hiking: "expert",
  difficult_alpine_hiking: "expert",
};
const GRADE = { G: "easy", B: "moderate", R: "hard", S: "expert" };
const ORDER = ["easy", "moderate", "hard", "expert"];

function parseDistanceKm(v) {
  const m = (v || "").trim().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(km|m)?$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return (m[2] || "km").toLowerCase() === "m" ? n / 1000 : n;
}

function parseDurationMinutes(v) {
  if (!v) return undefined;
  const hm = v.trim().match(/^(\d+):(\d{1,2})(?::\d{1,2})?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const iso = v.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (iso && (iso[1] || iso[2])) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  return undefined;
}

const truncate = (s, n = 400) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s || undefined);

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) [best, bestN] = [v, n];
  return best;
}

/** Common geometry-derived fields. Returns null for trips that are too large. */
function geometryFields(lines) {
  const bbox = bboxOf(lines);
  if (bboxExtentKm(bbox) > MAX_EXTENT_KM) return null;
  const [lon, lat] = center(bbox);
  const simplified = lines.map((l) => round5(simplify(l, SIMPLIFY_M))).filter((l) => l.length >= 2);
  const lengthKm = Math.round(lines.reduce((s, l) => s + lineLengthKm(l), 0) * 100) / 100;
  return { bbox, lat, lon, simplified, lengthKm };
}

const trips = []; // { trip, lines, nameKey }

// ---------------------------------------------------------------- Turrutebasen
let turrutebasenMeta = null;
if (existsSync("data-build/turrutebasen.json")) {
  const tr = JSON.parse(readFileSync("data-build/turrutebasen.json", "utf8"));
  turrutebasenMeta = { fetchedAt: tr.fetchedAt, segments: tr.segments.length };
  const groups = new Map();
  for (const seg of tr.segments) {
    const bbox = bboxOf(seg.lines);
    for (const info of seg.infos) {
      const name = (info.name || "").trim();
      if (!name || /^ukjent$/i.test(name)) continue;
      const key = `${norm(info.number)}|${norm(name)}`;
      const list = groups.get(key) || [];
      list.push({ seg, info, bbox, name });
      groups.set(key, list);
    }
  }
  for (const [key, items] of groups) {
    for (const cluster of clusterByProximity(items, 0.5)) {
      const unique = new Map(cluster.items.map((i) => [i.seg.id, i]));
      const lines = [...unique.values()].flatMap((i) => i.seg.lines);
      const g = geometryFields(lines);
      if (!g) continue;
      const infos = cluster.items.map((i) => i.info);
      const grades = infos.map((i) => GRADE[(i.grade || "").toUpperCase()]).filter(Boolean);
      const difficulty = grades.length
        ? [...new Set(grades)].sort((a, b) => {
            const n = (x) => grades.filter((y) => y === x).length;
            return n(b) - n(a) || ORDER.indexOf(b) - ORDER.indexOf(a);
          })[0]
        : undefined;
      const main = chainLines(lines)[0] || lines[0];
      const start = main[0];
      const minSeg = [...unique.keys()].sort()[0];
      const maintainer = mostCommon(infos.map((i) => i.maintainer));
      trips.push({
        nameKey: norm(cluster.items[0].name),
        lines: g.simplified,
        trip: {
          id: `tr-${shortHash(`${key}|${minSeg}`)}`,
          name: cluster.items[0].name,
          kind: "route",
          latitude: g.lat,
          longitude: g.lon,
          positionKind: "center",
          lengthKm: g.lengthKm,
          lengthIsMeasured: true,
          difficulty,
          difficultySource: difficulty ? "Official grading in Kartverket's trail database" : undefined,
          source: "turrutebasen",
          sourceLabel: "Norgeskart",
          sourceUrl: norgeskartUrl(start[1], start[0]),
          dataProvider: "Kartverket – national trail database (Turrutebasen)",
          operator: maintainer ? maintainer.replace(/\s*\|\s*/g, " · ") : undefined,
          ref: infos[0].number || undefined,
          marked: cluster.items.some((i) => (i.seg.marked || "").toUpperCase() === "JA") || undefined,
        },
      });
    }
  }
  console.log(`Turrutebasen: ${trips.length} trips from ${tr.segments.length} segments`);
}

// ------------------------------------------------------------- OpenStreetMap
let osmMeta = null;
const osmTrips = [];
if (existsSync("data-build/osm.ndjson")) {
  const trailWays = new Map();
  let lines = 0;
  for (const line of readFileSync("data-build/osm.ndjson", "utf8").split("\n")) {
    if (!line) continue;
    lines++;
    const o = JSON.parse(line);
    const t = o.tags || {};
    const website = safeUrl(t.website || t.url || t["contact:website"]);
    const known = website ? knownSite(website) : null;
    const link = (osmUrl) => ({
      source: known ? known.source : "osm",
      sourceLabel: known ? known.label : "OpenStreetMap",
      sourceUrl: known ? website : osmUrl,
      websiteUrl: website && !known ? website : undefined,
      dataProvider: "OpenStreetMap",
    });
    if (o.kind === "summit") {
      const ele = Number(String(t.ele || "").replace(",", ".").replace(/\s*m$/i, ""));
      osmTrips.push({
        nameKey: norm(o.name),
        lines: null,
        trip: {
          id: `osm-n${o.id}`,
          name: o.name,
          kind: "summit",
          latitude: o.lat,
          longitude: o.lon,
          positionKind: "destination",
          summitElevationM: Number.isFinite(ele) && ele > 0 ? ele : undefined,
          description: truncate(t.description),
          imageUrl: safeUrl(t.image),
          ...link(`https://www.openstreetmap.org/node/${o.id}`),
        },
      });
    } else if (o.kind === "route") {
      const g = geometryFields(o.lines);
      if (!g) continue;
      const stated = parseDistanceKm(t.distance);
      const duration = parseDurationMinutes(t.duration);
      const difficulty = SAC[t.sac_scale];
      osmTrips.push({
        nameKey: norm(o.name),
        lines: g.simplified,
        known: !!known,
        trip: {
          id: `osm-r${o.id}`,
          name: o.name,
          kind: "route",
          latitude: g.lat,
          longitude: g.lon,
          positionKind: "center",
          lengthKm: stated ?? g.lengthKm,
          lengthIsMeasured: stated == null ? true : undefined,
          difficulty,
          difficultySource: difficulty ? "OpenStreetMap sac_scale tag" : undefined,
          estimatedTimeMinutes: duration,
          estimatedTimeIsCalculated: duration == null ? undefined : false,
          description: truncate(t.description || t["description:nb"] || t["description:no"]),
          imageUrl: safeUrl(t.image),
          operator: t.operator,
          network: t.network,
          ref: t.ref,
          ...link(`https://www.openstreetmap.org/relation/${o.id}`),
        },
      });
    } else if (o.kind === "trail") {
      const key = norm(o.name);
      const list = trailWays.get(key) || [];
      list.push({ ...o, bbox: bboxOf(o.lines) });
      trailWays.set(key, list);
    }
  }
  for (const [key, ways] of trailWays) {
    for (const cluster of clusterByProximity(ways, 0.3)) {
      const g = geometryFields(cluster.items.flatMap((w) => w.lines));
      if (!g) continue;
      const ids = cluster.items.map((w) => w.id).sort((a, b) => a - b);
      const scales = cluster.items.map((w) => SAC[w.tags.sac_scale]).filter(Boolean);
      const difficulty = scales.sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0];
      const first = cluster.items.find((w) => w.id === ids[0]);
      const t = first.tags || {};
      const website = safeUrl(t.website || t.url);
      const known = website ? knownSite(website) : null;
      osmTrips.push({
        nameKey: key,
        lines: g.simplified,
        trip: {
          id: `osm-w${ids[0]}`,
          name: first.name,
          kind: "trail",
          latitude: g.lat,
          longitude: g.lon,
          positionKind: "center",
          lengthKm: g.lengthKm,
          lengthIsMeasured: true,
          difficulty,
          difficultySource: difficulty ? "OpenStreetMap sac_scale tag" : undefined,
          source: known ? known.source : "osm",
          sourceLabel: known ? known.label : "OpenStreetMap",
          sourceUrl: known ? website : `https://www.openstreetmap.org/way/${ids[0]}`,
          dataProvider: "OpenStreetMap",
        },
      });
    }
  }
  osmMeta = { lines };
  console.log(`OSM: ${osmTrips.length} trips from ${lines} features`);
}

// ------------------------------------------------------------------ Dedupe
// Prefer Kartverket routes (official grading); keep a Morotur/UT.no link from a
// matching OSM route. Drop OSM trails that duplicate a route with the same name.
const byName = new Map();
for (const t of trips) {
  const list = byName.get(t.nameKey) || [];
  list.push(t);
  byName.set(t.nameKey, list);
}
const near = (a, b) => haversineKm([a.longitude, a.latitude], [b.longitude, b.latitude]) <= DEDUPE_KM;
let merged = 0;
const osmRoutesByName = new Map();
for (const o of osmTrips) {
  if (o.trip.kind === "summit") {
    trips.push(o);
    continue;
  }
  const match = (byName.get(o.nameKey) || []).find((t) => near(t.trip, o.trip));
  if (match) {
    if (o.known) {
      Object.assign(match.trip, {
        source: o.trip.source,
        sourceLabel: o.trip.sourceLabel,
        sourceUrl: o.trip.sourceUrl,
      });
    }
    merged++;
    continue;
  }
  if (o.trip.kind === "route") {
    const list = osmRoutesByName.get(o.nameKey) || [];
    list.push(o);
    osmRoutesByName.set(o.nameKey, list);
  }
  trips.push(o);
}
// OSM trails duplicating an OSM route with the same name.
const finalTrips = trips.filter(
  (t) => !(t.trip.kind === "trail" && (osmRoutesByName.get(t.nameKey) || []).some((r) => near(r.trip, t.trip))),
);
console.log(`Merged ${merged} OSM duplicates; ${finalTrips.length} trips in total`);

// ------------------------------------------------------------------- Write
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const cells = new Map();
for (const { trip, lines } of finalTrips) {
  const cell = cellOf(trip.latitude, trip.longitude);
  const id = `${cell}~${trip.id}`;
  const entry = cells.get(cell) || { trips: [], geo: {} };
  const rounded = { ...trip, id, latitude: Math.round(trip.latitude * 1e5) / 1e5, longitude: Math.round(trip.longitude * 1e5) / 1e5 };
  const clean = Object.fromEntries(Object.entries(rounded).filter(([, v]) => v !== undefined && v !== null));
  entry.trips.push(clean);
  if (lines && lines.length) entry.geo[id] = lines;
  cells.set(cell, entry);
}
let bytes = 0;
for (const [cell, { trips: list, geo }] of cells) {
  const a = JSON.stringify({ trips: list });
  const b = JSON.stringify(geo);
  writeFileSync(`${OUT}/${cell}.json`, a);
  writeFileSync(`${OUT}/${cell}.geo.json`, b);
  bytes += a.length + b.length;
}
writeFileSync(
  `${OUT}/index.json`,
  JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    cellSize: { lat: 0.5, lon: 1 },
    cells: [...cells.keys()].sort(),
    tripCount: finalTrips.length,
    sources: { turrutebasen: turrutebasenMeta, osm: osmMeta },
  }),
);
console.log(`Wrote ${cells.size} cells, ${(bytes / 1e6).toFixed(1)} MB to ${OUT}`);
if (finalTrips.length === 0) process.exit(1);
