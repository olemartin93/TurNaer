"use client";
/**
 * Interactive map (Leaflet). Loaded with next/dynamic and ssr:false so it never
 * blocks the initial render.
 *
 * Base maps:
 * - Kartverket "topo" (WMTS cache, CC BY 4.0) – Norwegian topographic map, default
 * - Kartverket "topograatone" – grey topographic map
 * - OpenStreetMap standard tiles (ODbL, tile usage policy: no bulk/offline caching)
 * Overlay:
 * - Waymarked Trails hiking routes (CC BY-SA, data © OpenStreetMap contributors)
 *
 * Tiles are never cached by our service worker.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { HikingTrip, NearbyTrip } from "@/types/trip";
import type { LatLon, UserLocation } from "@/types/geo";
import { formatKm } from "@/lib/trips/format";

export type MapViewProps = {
  userLocation: UserLocation | null;
  radiusKm: number;
  trips: NearbyTrip[];
  selectedTrip: HikingTrip | null;
  selectedStart: LatLon | null;
  highlightPoint: LatLon | null;
  pickMode: boolean;
  onSelectTrip: (id: string) => void;
  onPickLocation: (point: LatLon) => void;
  onLocate: () => void;
};

const NORWAY_CENTER: L.LatLngExpression = [64.5, 12];

const kartverketAttribution =
  '&copy; <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>';
const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function tripIcon(selected: boolean): L.DivIcon {
  const size = selected ? 40 : 32;
  return L.divIcon({
    className: "turnaer-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
    html: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
      <path d="M16 31s-11-9.6-11-18a11 11 0 0 1 22 0c0 8.4-11 18-11 18z" fill="${selected ? "#c2410c" : "#245033"}" stroke="#fff" stroke-width="2"/>
      <path d="m9.5 18 4.5-7.5 2.8 4.4 1.7-2.3 4 5.4z" fill="#fff"/>
    </svg>`,
  });
}

const userIcon = L.divIcon({
  className: "turnaer-user",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#1f5f86;border:3px solid #fff;box-shadow:0 0 0 2px rgba(31,95,134,.35),0 2px 6px rgba(0,0,0,.3)"></span>`,
});

const startIcon = L.divIcon({
  className: "turnaer-start",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:9999px;background:#fff;border:3px solid #245033;font:700 12px system-ui;color:#245033">S</span>`,
});

export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const highlightRef = useRef<L.CircleMarker | null>(null);
  const propsRef = useRef(props);

  // Keep the latest callbacks/flags available to Leaflet event handlers.
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, {
      center: NORWAY_CENTER,
      zoom: 5,
      zoomControl: false,
      keyboard: true,
    });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

    const topo = L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png", {
      maxZoom: 18,
      attribution: kartverketAttribution,
    });
    const grey = L.tileLayer(
      "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
      { maxZoom: 18, attribution: kartverketAttribution },
    );
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: osmAttribution,
    });
    const trails = L.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.8,
      attribution:
        'Trails: <a href="https://hiking.waymarkedtrails.org" target="_blank" rel="noopener">Waymarked Trails</a> (CC BY-SA), ' +
        osmAttribution,
    });
    topo.addTo(map);

    L.control.zoom({ position: "topright", zoomInTitle: "Zoom in", zoomOutTitle: "Zoom out" }).addTo(map);
    L.control
      .layers(
        { "Topographic (Kartverket)": topo, "Grey topographic (Kartverket)": grey, OpenStreetMap: osm },
        { "Marked hiking trails": trails },
        { position: "topright" },
      )
      .addTo(map);

    // "Show my location" control.
    const Locate = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create("button", "leaflet-bar");
        btn.type = "button";
        btn.title = "Show my location";
        btn.setAttribute("aria-label", "Show my location");
        btn.style.cssText =
          "width:44px;height:44px;display:grid;place-items:center;background:#fff;cursor:pointer;color:#1c1f1e";
        btn.innerHTML =
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg>';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, "click", () => propsRef.current.onLocate());
        return btn;
      },
    });
    new Locate({ position: "topright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
    });
    map.addLayer(cluster);
    clusterRef.current = cluster;
    userLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (propsRef.current.pickMode) {
        propsRef.current.onPickLocation({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      }
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pick-mode cursor.
  const { pickMode } = props;
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode]);

  // User location + search radius.
  const { userLocation, radiusKm } = props;
  useEffect(() => {
    const map = mapRef.current;
    const layer = userLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!userLocation) return;
    const ll = L.latLng(userLocation.latitude, userLocation.longitude);
    L.circle(ll, {
      radius: radiusKm * 1000,
      color: "#245033",
      weight: 1.5,
      dashArray: "6 6",
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(layer);
    if (userLocation.accuracyM && userLocation.accuracyM < 5000) {
      L.circle(ll, {
        radius: userLocation.accuracyM,
        color: "#1f5f86",
        weight: 1,
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(layer);
    }
    L.marker(ll, {
      icon: userIcon,
      title: "Your location",
      alt: "Your location",
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(layer);
    if (!propsRef.current.selectedTrip) {
      map.fitBounds(ll.toBounds(radiusKm * 2000), { padding: [20, 20], animate: false });
    }
  }, [userLocation, radiusKm]);

  // Trip markers (clustered).
  const { trips, selectedTrip } = props;
  const selectedId = selectedTrip?.id ?? null;
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const markers = trips.map((trip) => {
      const selected = trip.id === selectedId;
      const marker = L.marker([trip.latitude, trip.longitude], {
        icon: tripIcon(selected),
        title: trip.name,
        alt: trip.name,
        riseOnHover: true,
        zIndexOffset: selected ? 500 : 0,
      });
      const popup = L.DomUtil.create("div");
      popup.innerHTML = `<p style="margin:0;font-weight:700;font-size:15px">${escapeHtml(trip.name)}</p>${
        trip.distanceFromUserKm != null
          ? `<p style="margin:2px 0 8px;color:#4a504d">${formatKm(trip.distanceFromUserKm)} from you</p>`
          : '<p style="margin:2px 0 8px"></p>'
      }`;
      const btn = L.DomUtil.create("button", "", popup);
      btn.type = "button";
      btn.textContent = "Show details";
      btn.style.cssText =
        "min-height:44px;padding:0 16px;border-radius:9999px;background:#245033;color:#fff;font-weight:600;border:0;cursor:pointer";
      L.DomEvent.on(btn, "click", () => {
        propsRef.current.onSelectTrip(trip.id);
        mapRef.current?.closePopup();
      });
      marker.bindPopup(popup, { closeButton: true, minWidth: 180 });
      marker.on("popupopen", () => btn.focus());
      return marker;
    });
    cluster.addLayers(markers);
  }, [trips, selectedId]);

  // Selected trip route.
  const { selectedStart } = props;
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!selectedTrip) return;
    if (selectedTrip.route) {
      L.geoJSON(selectedTrip.route, { style: { color: "#ffffff", weight: 8, opacity: 0.9 }, interactive: false }).addTo(
        layer,
      );
      const line = L.geoJSON(selectedTrip.route, {
        style: { color: "#c2410c", weight: 4.5, opacity: 1, lineCap: "round", lineJoin: "round" },
        interactive: false,
      }).addTo(layer);
      const bounds = line.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } else {
      map.setView([selectedTrip.latitude, selectedTrip.longitude], Math.max(map.getZoom(), 12));
      L.marker([selectedTrip.latitude, selectedTrip.longitude], {
        icon: tripIcon(true),
        title: selectedTrip.name,
        alt: selectedTrip.name,
        keyboard: false,
      }).addTo(layer);
    }
    if (selectedStart) {
      L.marker([selectedStart.latitude, selectedStart.longitude], {
        icon: startIcon,
        title: "Trailhead",
        alt: "Trailhead",
        keyboard: false,
      }).addTo(layer);
    }
  }, [selectedTrip, selectedStart]);

  // Highlight a point hovered in the elevation profile.
  const { highlightPoint } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    highlightRef.current?.remove();
    highlightRef.current = null;
    if (highlightPoint) {
      highlightRef.current = L.circleMarker([highlightPoint.latitude, highlightPoint.longitude], {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#1c1f1e",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    }
  }, [highlightPoint]);

  return (
    <div
      ref={containerRef}
      className="size-full"
      role="region"
      aria-label="Map of trips. Use the arrow keys to pan, plus and minus to zoom, and Tab to reach trip markers."
    />
  );
}
