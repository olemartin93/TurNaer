// Geometry helpers for the data pipeline (plain JS, no dependencies).
// Coordinates are [lon, lat] in degrees (WGS84/ETRS89 – identical at this precision).

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const lineLengthKm = (line) => line.slice(1).reduce((s, p, i) => s + haversineKm(line[i], p), 0);

export function bboxOf(lines) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const line of lines)
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  return { minLon, minLat, maxLon, maxLat };
}

export const bboxExtentKm = (b) => haversineKm([b.minLon, b.minLat], [b.maxLon, b.maxLat]);

export function bboxTouch(a, b, marginKm) {
  const dLat = marginKm / 111.32;
  const dLon = marginKm / (111.32 * Math.cos(rad((a.minLat + a.maxLat) / 2)));
  return !(
    a.maxLat + dLat < b.minLat ||
    b.maxLat + dLat < a.minLat ||
    a.maxLon + dLon < b.minLon ||
    b.maxLon + dLon < a.minLon
  );
}

export const mergeBbox = (a, b) => ({
  minLon: Math.min(a.minLon, b.minLon),
  minLat: Math.min(a.minLat, b.minLat),
  maxLon: Math.max(a.maxLon, b.maxLon),
  maxLat: Math.max(a.maxLat, b.maxLat),
});

/**
 * Group items (each with a `bbox`) whose extents touch within `marginKm` into clusters.
 * Used to split same-named segments that are actually different trails far apart.
 */
export function clusterByProximity(items, marginKm) {
  const clusters = [];
  for (const item of items) {
    const touching = clusters.filter((c) => bboxTouch(c.bbox, item.bbox, marginKm));
    if (touching.length === 0) {
      clusters.push({ bbox: item.bbox, items: [item] });
      continue;
    }
    const [target, ...rest] = touching;
    target.items.push(item);
    target.bbox = mergeBbox(target.bbox, item.bbox);
    for (const other of rest) {
      target.items.push(...other.items);
      target.bbox = mergeBbox(target.bbox, other.bbox);
      clusters.splice(clusters.indexOf(other), 1);
    }
  }
  return clusters;
}

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;

/** Join line segments that share end points into continuous lines (longest first). */
export function chainLines(segments) {
  const remaining = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const chains = [];
  while (remaining.length) {
    const chain = remaining.shift();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        const head = chain[0], tail = chain[chain.length - 1];
        if (same(tail, s[0])) chain.push(...s.slice(1));
        else if (same(tail, s[s.length - 1])) chain.push(...[...s].reverse().slice(1));
        else if (same(head, s[s.length - 1])) chain.unshift(...s.slice(0, -1));
        else if (same(head, s[0])) chain.unshift(...[...s].reverse().slice(0, -1));
        else continue;
        remaining.splice(i, 1);
        grown = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains.sort((a, b) => lineLengthKm(b) - lineLengthKm(a));
}

/** Douglas–Peucker simplification with a tolerance in metres (local equirectangular projection). */
export function simplify(line, toleranceM) {
  if (line.length <= 2) return line;
  const lat0 = rad(line[0][1]);
  const k = 111320;
  const xy = line.map(([lon, lat]) => [lon * k * Math.cos(lat0), lat * k]);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = xy[s], [x2, y2] = xy[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = xy[i];
      let t = len2 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

export const round5 = (line) => line.map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);

/**
 * WGS84/ETRS89 lat/lon -> EPSG:25833 (UTM zone 33N) easting/northing in metres.
 * Standard transverse Mercator series (accurate to well under a metre in Norway).
 */
export function toUtm33(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101; // GRS80
  const k0 = 0.9996, lon0 = rad(15), e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const phi = rad(lat), lam = rad(lon);
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lam - lon0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const easting =
    500000 +
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120);
  const northing =
    k0 *
    (M +
      N *
        Math.tan(phi) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { easting, northing };
}

/** Link to Kartverket's map viewer (Norgeskart) with a marker at the given point. */
export function norgeskartUrl(lat, lon, zoom = 14) {
  const { easting, northing } = toUtm33(lat, lon);
  const e = easting.toFixed(2), n = northing.toFixed(2);
  return `https://www.norgeskart.no/#!?project=norgeskart&layers=1002&zoom=${zoom}&lat=${n}&lon=${e}&markerLat=${n}&markerLon=${e}`;
}
