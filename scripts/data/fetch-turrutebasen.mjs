// Downloads walking routes (app:Fotrute) from Kartverket's national trail database
// ("Nasjonal database for tur- og friluftsruter", open data, NLOD) via its WFS,
// cell by cell over Norway, and writes the segments to data-build/turrutebasen.json.
//
// Quirks of this WFS (documented by other projects that use it):
// - outputFormat must be exactly "application/gml+xml; version=3.2"
// - bbox must be "minLon,minLat,maxLon,maxLat,EPSG:4326"; the urn: spelling silently returns nothing
// - geometry comes back as urn:ogc:def:crs:EPSG::4258, i.e. "lat lon" pairs
// - numberMatched/numberReturned can't be trusted, and paging isn't reliable,
//   so we use small cells and split a cell whenever it comes back full.
// - the service can hang, so every request has a timeout and retries.
import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINT = process.env.TURRUTEBASEN_WFS_URL || "https://wfs.geonorge.no/skwms1/wfs.turogfriluftsruter";
const COUNT = 5000;
const TIMEOUT_MS = 120_000;
const RETRIES = 3;
const CONCURRENCY = 4;
const USER_AGENT = "TurNaer-data-build (+https://github.com/olemartin93/TurNaer)";

// Mainland Norway + Svalbard excluded. Cells of 0.5° lat x 1° lon (~55 x 50 km).
const LAT_MIN = 57.5, LAT_MAX = 71.5, LON_MIN = 4.0, LON_MAX = 31.5;

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();

const field = (xml, name) => {
  const m = xml.match(new RegExp(`<app:${name}>([^<]*)</app:${name}>`));
  return m ? decode(m[1]) : "";
};

/** Parse "lat lon lat lon ..." into [[lon, lat], ...], guarding against swapped axes. */
function parsePosList(text) {
  const n = text.trim().split(/\s+/).map(Number);
  const out = [];
  for (let i = 0; i + 1 < n.length; i += 2) {
    let lat = n[i], lon = n[i + 1];
    // In Norway latitude (57–72) is always larger than longitude (4–32).
    if (lat < lon) [lat, lon] = [lon, lat];
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push([lon, lat]);
  }
  return out;
}

export function parseFotruteGml(xml) {
  const segments = [];
  for (const member of xml.split(/<wfs:member>/).slice(1)) {
    const idMatch = member.match(/<app:Fotrute[^>]*gml:id="([^"]+)"/);
    if (!idMatch) continue;
    const lines = [...member.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)]
      .map((m) => parsePosList(m[1]))
      .filter((l) => l.length >= 2);
    if (lines.length === 0) continue;
    const infos = [...member.matchAll(/<app:FotruteInfo>([\s\S]*?)<\/app:FotruteInfo>/g)].map((m) => ({
      name: field(m[1], "rutenavn"),
      number: field(m[1], "rutenummer"),
      maintainer: field(m[1], "vedlikeholdsansvarlig"),
      grade: field(m[1], "gradering"),
    }));
    segments.push({ id: idMatch[1], marked: field(member, "merking"), lines, infos });
  }
  return segments;
}

async function fetchCell(cell, attempt = 1) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "app:Fotrute",
    outputFormat: "application/gml+xml; version=3.2",
    count: String(COUNT),
    bbox: `${cell.minLon},${cell.minLat},${cell.maxLon},${cell.maxLat},EPSG:4326`,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes("ExceptionReport")) throw new Error(`WFS exception: ${text.slice(0, 300)}`);
    return parseFotruteGml(text);
  } catch (error) {
    if (attempt >= RETRIES) throw error;
    await new Promise((r) => setTimeout(r, 5000 * attempt));
    return fetchCell(cell, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

function split(cell) {
  const midLat = (cell.minLat + cell.maxLat) / 2, midLon = (cell.minLon + cell.maxLon) / 2;
  return [
    { ...cell, maxLat: midLat, maxLon: midLon },
    { ...cell, maxLat: midLat, minLon: midLon },
    { ...cell, minLat: midLat, maxLon: midLon },
    { ...cell, minLat: midLat, minLon: midLon },
  ];
}

async function main() {
  const queue = [];
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += 0.5)
    for (let lon = LON_MIN; lon < LON_MAX; lon += 1)
      queue.push({ minLat: lat, maxLat: lat + 0.5, minLon: lon, maxLon: lon + 1, depth: 0 });

  const byId = new Map();
  let done = 0, failed = 0, nonEmpty = 0;
  const total = () => queue.length + done;

  async function worker() {
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      try {
        const segments = await fetchCell(cell);
        if (segments.length >= COUNT && cell.depth < 4) {
          queue.push(...split(cell).map((c) => ({ ...c, depth: cell.depth + 1 })));
        } else {
          if (segments.length >= COUNT) console.warn(`Cell still full at max depth, data may be incomplete`, cell);
          for (const s of segments) byId.set(s.id, s);
          if (segments.length) nonEmpty++;
        }
      } catch (error) {
        failed++;
        console.warn(`Cell failed (${cell.minLat},${cell.minLon} d${cell.depth}): ${error.message}`);
      }
      done++;
      if (done % 50 === 0) console.log(`${done}/${total()} cells, ${byId.size} segments, ${failed} failed`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Turrutebasen: ${byId.size} segments from ${nonEmpty} cells; ${failed} cells failed of ${done}`);
  if (byId.size === 0) throw new Error("No Turrutebasen data fetched");
  if (failed / done > 0.2) throw new Error(`Too many failed cells (${failed}/${done})`);
  mkdirSync("data-build", { recursive: true });
  writeFileSync(
    "data-build/turrutebasen.json",
    JSON.stringify({ fetchedAt: new Date().toISOString(), failedCells: failed, segments: [...byId.values()] }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
