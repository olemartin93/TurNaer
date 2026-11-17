// Generates out/sw.js after `next build` with a precache list of the static export.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(OUT);

const hash = createHash("sha256");
const precache = [];
for (const file of files.sort()) {
  const rel = relative(OUT, file).split(sep).join("/");
  if (rel === "sw.js" || rel.endsWith(".map") || rel === ".nojekyll") continue;
  if (rel === "icons/og-image.png") continue;
  // Trip data cells are cached on demand (runtime), not all at install.
  if (rel.startsWith("data/tiles/")) continue;
  hash.update(rel).update(readFileSync(file));
  // Directory index pages are requested as "/path/", not "/path/index.html".
  const urlPath = rel === "index.html" ? "/" : rel.endsWith("/index.html") ? `/${rel.slice(0, -"index.html".length)}` : `/${rel}`;
  precache.push(`${base}${urlPath}`);
}

const hostsFromEnv = (value, fallback) => {
  try {
    return new URL(value || fallback).hostname;
  } catch {
    return new URL(fallback).hostname;
  }
};
const overpassHosts = (process.env.NEXT_PUBLIC_OVERPASS_API_URLS || "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter")
  .split(",")
  .map((u) => hostsFromEnv(u.trim(), "https://overpass-api.de/api/interpreter"));
const dataHosts = [
  ...new Set([
    hostsFromEnv(process.env.NEXT_PUBLIC_MET_API_URL, "https://api.met.no/weatherapi/locationforecast/2.0"),
    hostsFromEnv(process.env.NEXT_PUBLIC_KARTVERKET_ADDRESS_API_URL, "https://ws.geonorge.no/adresser/v1"),
    hostsFromEnv(process.env.NEXT_PUBLIC_KARTVERKET_PLACENAMES_API_URL, "https://api.kartverket.no/stedsnavn/v1"),
    hostsFromEnv(process.env.NEXT_PUBLIC_KARTVERKET_ELEVATION_API_URL, "https://ws.geonorge.no/hoydedata/v1"),
    ...overpassHosts,
  ]),
];

const template = readFileSync(new URL("./sw-template.js", import.meta.url), "utf8");
const sw = template
  .replace("__VERSION__", hash.digest("hex").slice(0, 12))
  .replace("__BASE__", base)
  .replace("__PRECACHE__", JSON.stringify(precache, null, 2))
  .replace("__DATA_HOSTS__", JSON.stringify(dataHosts));
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`sw.js: ${precache.length} files precached, data hosts: ${dataHosts.join(", ")}`);
