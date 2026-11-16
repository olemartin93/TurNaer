/**
 * Kartverket address and place-name search.
 *
 * - Address API (Geonorge "adresser" v1): GET {addressApi}/sok, GET {addressApi}/punktsok
 * - Place names API (Sentralt stedsnavnregister, "stedsnavn" v1): GET {placeNamesApi}/navn, GET {placeNamesApi}/punkt
 *
 * Both are open, key-less, CORS-enabled and licensed CC BY 4.0 (© Kartverket).
 * Coordinates are requested in EPSG:4258 (ETRS89 geographic ≈ WGS84 lat/lon).
 */
import { config } from "@/lib/config";
import { fetchJson } from "@/lib/http";
import type { LatLon } from "@/types/geo";

export type SearchResult = LatLon & {
  id: string;
  name: string;
  detail: string;
  kind: "address" | "place";
};

type AddressResponse = {
  adresser?: {
    adressetekst?: string;
    postnummer?: string;
    poststed?: string;
    kommunenavn?: string;
    representasjonspunkt?: { lat?: number; lon?: number };
  }[];
};

type PlaceName = {
  skrivemåte?: string;
  stedsnavn?: { skrivemåte?: string }[];
  navneobjekttype?: string;
  stedsnummer?: number;
  meterFraPunkt?: number;
  kommuner?: { kommunenavn?: string }[];
  fylker?: { fylkesnavn?: string }[];
  representasjonspunkt?: { nord?: number; øst?: number };
};

type PlaceNameResponse = { navn?: PlaceName[] };

const placeNameText = (n: PlaceName): string | undefined => n.skrivemåte ?? n.stedsnavn?.[0]?.skrivemåte;

async function searchPlaceNames(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    sok: query.endsWith("*") ? query : `${query}*`,
    fuzzy: "true",
    utkoordsys: "4258",
    treffPerSide: "8",
    side: "1",
  });
  const { data } = await fetchJson<PlaceNameResponse>(`${config.kartverket.placeNamesApi}/navn?${params}`, {
    signal,
  });
  return (data.navn ?? []).flatMap((n): SearchResult[] => {
    const name = placeNameText(n);
    const lat = n.representasjonspunkt?.nord;
    const lon = n.representasjonspunkt?.øst;
    if (!name || lat == null || lon == null) return [];
    const area = [n.kommuner?.[0]?.kommunenavn, n.fylker?.[0]?.fylkesnavn].filter(Boolean).join(", ");
    return [
      {
        id: `place-${n.stedsnummer ?? `${lat},${lon}`}`,
        name,
        detail: [n.navneobjekttype, area].filter(Boolean).join(" · "),
        latitude: lat,
        longitude: lon,
        kind: "place",
      },
    ];
  });
}

async function searchAddresses(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    sok: query,
    fuzzy: "true",
    utkoordsys: "4258",
    treffPerSide: "5",
    side: "0",
    asciiKompatibel: "true",
  });
  const { data } = await fetchJson<AddressResponse>(`${config.kartverket.addressApi}/sok?${params}`, { signal });
  return (data.adresser ?? []).flatMap((a): SearchResult[] => {
    const lat = a.representasjonspunkt?.lat;
    const lon = a.representasjonspunkt?.lon;
    if (!a.adressetekst || lat == null || lon == null) return [];
    return [
      {
        id: `addr-${a.adressetekst}-${a.postnummer ?? ""}`,
        name: a.adressetekst,
        detail: [a.postnummer, a.poststed].filter(Boolean).join(" ") || (a.kommunenavn ?? ""),
        latitude: lat,
        longitude: lon,
        kind: "address",
      },
    ];
  });
}

/** Search Norwegian place names and addresses. Place names (mountains, lakes, towns) come first. */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [places, addresses] = await Promise.allSettled([searchPlaceNames(q, signal), searchAddresses(q, signal)]);
  const results = [
    ...(places.status === "fulfilled" ? places.value : []),
    ...(addresses.status === "fulfilled" ? addresses.value : []),
  ];
  if (results.length === 0 && places.status === "rejected" && addresses.status === "rejected") {
    throw places.reason;
  }
  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, 10);
}

/** Reverse geocode: the nearest named place, e.g. "Aksla, Ålesund". Returns null if nothing nearby. */
export async function reverseGeocode(point: LatLon, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    nord: point.latitude.toFixed(5),
    ost: point.longitude.toFixed(5),
    koordsys: "4258",
    utkoordsys: "4258",
    radius: "2000",
    treffPerSide: "20",
  });
  const { data } = await fetchJson<PlaceNameResponse>(`${config.kartverket.placeNamesApi}/punkt?${params}`, {
    signal,
  });
  const preferredTypes = new Set(["By", "Tettsted", "Tettsteddel", "Bydel", "Grend", "Gard", "Bygdelag (bygd)"]);
  const names = [...(data.navn ?? [])].sort((a, b) => (a.meterFraPunkt ?? 0) - (b.meterFraPunkt ?? 0));
  const best = names.find((n) => preferredTypes.has(n.navneobjekttype ?? "")) ?? names[0];
  const name = best ? placeNameText(best) : undefined;
  if (!best || !name) return null;
  const kommune = best.kommuner?.[0]?.kommunenavn;
  return kommune && kommune !== name ? `${name}, ${kommune}` : name;
}
