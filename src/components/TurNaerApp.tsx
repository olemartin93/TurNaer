"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HikingTrip, NearbyTrip } from "@/types/trip";
import type { LatLon, UserLocation } from "@/types/geo";
import type { ConditionLevel } from "@/types/weather";
import { getNearbyTrips, withDistance } from "@/services/hiking";
import { reverseGeocode, type SearchResult } from "@/services/kartverket/geocoding";
import { GeolocationError, geolocationMessages, getCurrentLocation } from "@/lib/geo/geolocation";
import {
  DEFAULT_RADIUS,
  EMPTY_FILTERS,
  RADIUS_OPTIONS,
  activeFilterCount,
  applyFilters,
  type RadiusKm,
  type TripFilters,
} from "@/lib/trips/filters";
import { rankTrips, type SortMode } from "@/lib/trips/ranking";
import { assessWeather } from "@/lib/weather/assessment";
import { readCache, readPref, writeCache, writePref } from "@/lib/cache";
import { useFavorites } from "@/hooks/useFavorites";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTripDetail } from "@/hooks/useTripDetail";
import { useWeather } from "@/hooks/useWeather";
import { FiltersPanel } from "./FiltersPanel";
import { CloseIcon, FilterIcon, LocateIcon, Logo, OfflineIcon, PinIcon } from "./Icons";
import { Landing } from "./Landing";
import { LocationSearch } from "./LocationSearch";
import { Notice } from "./Notice";
import { Spinner } from "./Spinner";
import { TripCard } from "./TripCard";
import { TripDetail } from "./TripDetail";

const MapView = dynamic(() => import("./map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center bg-birch-200 text-granite-600">
      <Spinner label="Loading map" />
    </div>
  ),
});

type TripsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; trips: NearbyTrip[]; partial: boolean }
  | { status: "error" };

/** Identifies one search; results for another key are treated as "loading". */
type KeyedTripsState = TripsState & { key: string };

type LastSearch = { location: UserLocation; radius: RadiusKm };

/** Number of trips (closest first) we fetch weather for, to keep MET requests modest. */
const WEATHER_LIMIT = 12;
const PAGE_SIZE = 25;

const roundLocation = (l: UserLocation): UserLocation => ({
  ...l,
  latitude: Math.round(l.latitude * 1000) / 1000,
  longitude: Math.round(l.longitude * 1000) / 1000,
  accuracyM: undefined,
  origin: "cache",
});

export function TurNaerApp() {
  const online = useOnlineStatus();
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [filters, setFilters] = useState<TripFilters>(EMPTY_FILTERS);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [showFilters, setShowFilters] = useState(false);
  const [rawTripsState, setTripsState] = useState<KeyedTripsState>({ status: "idle", key: "" });
  const [retryCount, setRetryCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [highlight, setHighlight] = useState<LatLon | null>(null);
  const [enriched, setEnriched] = useState<Record<string, HikingTrip>>({});
  const [lastSearch, setLastSearch] = useState<LastSearch | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { favorites, favoriteIds, toggleFavorite } = useFavorites();
  const panelRef = useRef<HTMLDivElement>(null);

  // ---- Restore preferences and handle shareable ?trip= links -------------------------------
  useEffect(() => {
    /* Hydrate preferences from browser storage after mount (not available while prerendering). */
    /* eslint-disable react-hooks/set-state-in-effect */
    const savedRadius = readPref<number>("radius", DEFAULT_RADIUS);
    if ((RADIUS_OPTIONS as readonly number[]).includes(savedRadius)) setRadius(savedRadius as RadiusKm);
    setSortMode(readPref<SortMode>("sort", "distance"));
    setEnriched(readCache<Record<string, HikingTrip>>("enriched") ?? {});
    setLastSearch(readPref<LastSearch | null>("last", null));
    const tripParam = new URLSearchParams(window.location.search).get("trip");
    if (tripParam) {
      setSelectedId(tripParam);
      setExploring(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const onPop = () => setSelectedId(new URLSearchParams(window.location.search).get("trip"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ---- Location ----------------------------------------------------------------------------
  const applyLocation = useCallback((loc: UserLocation) => {
    setLocation(loc);
    setLocationError(null);
    setPickMode(false);
    setExploring(true);
    setVisibleCount(PAGE_SIZE);
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const loc = await getCurrentLocation();
      applyLocation(loc);
    } catch (error) {
      const reason = error instanceof GeolocationError ? error.reason : "unavailable";
      setLocationError(geolocationMessages[reason]);
    } finally {
      setLocating(false);
    }
  }, [applyLocation]);

  const onSearchSelect = useCallback(
    (r: SearchResult) =>
      applyLocation({ latitude: r.latitude, longitude: r.longitude, label: r.name, origin: "search" }),
    [applyLocation],
  );

  const onPickLocation = useCallback(
    (p: LatLon) => applyLocation({ ...p, origin: "map", label: "Selected point" }),
    [applyLocation],
  );

  // Name the location with Kartverket's place-name register (stays in the browser).
  useEffect(() => {
    if (!location || (location.label && location.origin === "search")) return;
    const controller = new AbortController();
    reverseGeocode(location, controller.signal)
      .then((label) => {
        if (label) setLocation((l) => (l && l.latitude === location.latitude ? { ...l, label } : l));
      })
      .catch(() => undefined);
    return () => controller.abort();
    // Only when the coordinates change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude]);

  // ---- Nearby trips ------------------------------------------------------------------------
  const searchKey = location ? `${location.latitude},${location.longitude},${radius},${retryCount}` : "";
  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    const key = searchKey;
    getNearbyTrips(location, radius, controller.signal)
      .then(({ trips, failedProviders }) => {
        setTripsState({ status: "ready", trips, partial: failedProviders.length > 0, key });
      })
      .catch(() => {
        if (!controller.signal.aborted) setTripsState({ status: "error", key });
      });
    return () => controller.abort();
    // Label changes must not trigger a new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);
  const tripsState: TripsState = useMemo(
    () => (!searchKey ? { status: "idle" } : rawTripsState.key === searchKey ? rawTripsState : { status: "loading" }),
    [rawTripsState, searchKey],
  );

  // Remember the last successful search (rounded to ~100 m, stored only in this browser)
  // so it can be reopened later, also offline.
  useEffect(() => {
    if (location && tripsState.status === "ready") {
      writePref<LastSearch>("last", { location: roundLocation(location), radius });
    }
  }, [location, radius, tripsState.status]);

  const nearby: NearbyTrip[] = useMemo(() => {
    if (tripsState.status !== "ready") return [];
    return tripsState.trips.map((t) => {
      const extra = enriched[t.id];
      return extra ? { ...t, ...pickEnrichment(extra) } : t;
    });
  }, [tripsState, enriched]);

  const filtered = useMemo(() => {
    if (filters.favoritesOnly) {
      // Favourites can be outside the current radius; show them all, nearest first.
      const favs = Object.values(favorites).map((t) => withDistance({ ...t, ...pickEnrichment(enriched[t.id]) }, location));
      return applyFilters(favs, filters, favoriteIds).sort(
        (a, b) => (a.distanceFromUserKm ?? 0) - (b.distanceFromUserKm ?? 0),
      );
    }
    return applyFilters(nearby, filters, favoriteIds);
  }, [nearby, filters, favoriteIds, favorites, enriched, location]);

  // ---- Weather (only for the closest/visible trips and the selected one) --------------------
  const selectedListTrip = useMemo(
    () => nearby.find((t) => t.id === selectedId) ?? (selectedId ? (favorites[selectedId] ?? null) : null),
    [nearby, favorites, selectedId],
  );

  const onEnriched = useCallback((trip: HikingTrip) => {
    setEnriched((prev) => {
      const next = { ...prev, [trip.id]: pickEnrichment(trip) as HikingTrip };
      writeCache("enriched", next, 90 * 24 * 60 * 60 * 1000);
      return next;
    });
  }, []);

  const detail = useTripDetail(selectedId, selectedListTrip, location, onEnriched);

  const weatherTargets = useMemo(() => {
    const targets = filtered.slice(0, WEATHER_LIMIT).map((t) => ({ id: t.id, latitude: t.latitude, longitude: t.longitude }));
    const sel = detail.trip;
    if (sel && !targets.some((t) => t.id === sel.id)) {
      const p = detail.start ?? sel;
      targets.push({ id: sel.id, latitude: p.latitude, longitude: p.longitude });
    }
    return targets;
  }, [filtered, detail.trip, detail.start]);

  const weather = useWeather(weatherTargets);

  const conditions = useMemo(() => {
    const map = new Map<string, ConditionLevel>();
    weather.forEach((state, id) => {
      if (state.status === "ready") {
        const a = assessWeather(state.forecast);
        if (a) map.set(id, a.level);
      }
    });
    return map;
  }, [weather]);

  const ranked = useMemo(() => rankTrips(filtered, sortMode, conditions), [filtered, sortMode, conditions]);

  // ---- Selection & URL ---------------------------------------------------------------------
  const selectTrip = useCallback((id: string) => {
    setSelectedId(id);
    setExploring(true);
    const url = new URL(window.location.href);
    url.searchParams.set("trip", id);
    window.history.pushState({ trip: id }, "", url);
    panelRef.current?.scrollTo({ top: 0 });
  }, []);

  const closeTrip = useCallback(() => {
    setSelectedId(null);
    setHighlight(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("trip");
    window.history.pushState({}, "", url);
  }, []);

  const changeRadius = (r: RadiusKm) => {
    setRadius(r);
    writePref("radius", r);
    setVisibleCount(PAGE_SIZE);
  };
  const changeSort = (s: SortMode) => {
    setSortMode(s);
    writePref("sort", s);
  };

  // ---- Render ------------------------------------------------------------------------------
  const showLanding = !exploring;
  const filterCount = activeFilterCount(filters);

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-[1000] flex items-center justify-between gap-3 border-b border-birch-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            if (selectedId) closeTrip();
            else setExploring(false);
          }}
          className="flex items-center gap-2 rounded-lg text-xl font-extrabold tracking-tight text-pine-800"
          aria-label="TurNær – back to start"
        >
          <Logo className="text-3xl" />
          TurNær
        </button>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href="/about/"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-granite-700 hover:bg-birch-100"
          >
            About<span className="hidden sm:inline">&nbsp;&amp; data</span>
          </Link>
          {!showLanding ? (
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-pine-700 px-4 text-sm font-semibold text-white hover:bg-pine-800 disabled:opacity-70"
            >
              {locating ? <Spinner label="Finding your location" /> : <LocateIcon className="text-lg" />}
              <span className="hidden sm:inline">Locate me</span>
              <span className="sr-only sm:hidden">Locate me</span>
            </button>
          ) : null}
        </nav>
      </header>

      {!online ? (
        <div role="status" className="flex items-center justify-center gap-2 bg-granite-900 px-4 py-2 text-sm font-medium text-white">
          <OfflineIcon /> You are offline. Showing previously loaded data where available.
        </div>
      ) : null}

      <main id="main" className="relative min-h-0 flex-1">
        {showLanding ? (
          <Landing
            locating={locating}
            locationError={locationError}
            lastSearch={lastSearch}
            favoritesCount={favoriteIds.size}
            onLocate={locate}
            onSearchSelect={onSearchSelect}
            onPickOnMap={() => {
              setExploring(true);
              setPickMode(true);
            }}
            onResume={(l) => {
              changeRadius(l.radius);
              applyLocation(l.location);
            }}
            onShowFavorites={() => {
              setExploring(true);
              setFilters({ ...EMPTY_FILTERS, favoritesOnly: true });
            }}
          />
        ) : (
          <div className="flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
            <section aria-label="Map" className="relative h-[42dvh] shrink-0 lg:h-full">
              <MapView
                userLocation={location}
                radiusKm={radius}
                trips={ranked}
                selectedTrip={detail.trip}
                selectedStart={detail.start}
                highlightPoint={highlight}
                pickMode={pickMode}
                onSelectTrip={selectTrip}
                onPickLocation={onPickLocation}
                onLocate={locate}
              />
              {pickMode ? (
                <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-14">
                  <p className="pointer-events-auto flex items-center gap-2 rounded-full bg-granite-900 py-1 pl-4 pr-1 text-sm font-semibold text-white shadow-card">
                    Tap the map to choose a starting point
                    <button
                      type="button"
                      onClick={() => setPickMode(false)}
                      className="grid size-9 place-items-center rounded-full hover:bg-white/15"
                      aria-label="Cancel choosing a point"
                    >
                      <CloseIcon />
                    </button>
                  </p>
                </div>
              ) : null}
            </section>

            <aside
              ref={panelRef}
              aria-label={selectedId ? "Trip details" : "Nearby trips"}
              className="min-h-0 flex-1 overflow-y-auto border-t border-birch-200 bg-birch-50 lg:border-l lg:border-t-0"
            >
              {selectedId ? (
                <TripDetail
                  detail={detail}
                  weather={selectedId ? weather.get(selectedId) : undefined}
                  userLocation={location}
                  isFavorite={favoriteIds.has(selectedId)}
                  onToggleFavorite={toggleFavorite}
                  onBack={closeTrip}
                  onHoverPoint={setHighlight}
                />
              ) : (
                <div className="space-y-4 p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h1 className="text-xl font-extrabold tracking-tight">
                          {filters.favoritesOnly ? "Your favourites" : "Nearby trips"}
                        </h1>
                        {location ? (
                          <p className="flex items-center gap-1 text-sm text-granite-700">
                            <PinIcon className="text-fjord-600" />
                            {location.label ? `Near ${location.label}` : "Near your location"}
                          </p>
                        ) : (
                          <p className="text-sm text-granite-700">Choose a starting point to find trips.</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickMode((p) => !p)}
                        aria-pressed={pickMode}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fjord-700 ring-1 ring-birch-300 hover:bg-white"
                      >
                        <PinIcon /> Pick on map
                      </button>
                    </div>
                    <LocationSearch onSelect={onSearchSelect} compact label="Search for another place" />
                    {locationError ? <Notice tone="warning" title={locationError} /> : null}

                    <div className="flex items-end gap-2">
                      <div>
                        <label htmlFor="radius" className="mb-1 block text-xs font-semibold text-granite-700">
                          Search radius
                        </label>
                        <select
                          id="radius"
                          value={radius}
                          onChange={(e) => changeRadius(Number(e.target.value) as RadiusKm)}
                          className="min-h-11 rounded-xl border border-birch-300 bg-white px-3 text-sm font-semibold"
                        >
                          {RADIUS_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r} km
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="sort" className="mb-1 block text-xs font-semibold text-granite-700">
                          Sort by
                        </label>
                        <select
                          id="sort"
                          value={sortMode}
                          onChange={(e) => changeSort(e.target.value as SortMode)}
                          className="min-h-11 rounded-xl border border-birch-300 bg-white px-3 text-sm font-semibold"
                        >
                          <option value="distance">Distance</option>
                          <option value="weather">Weather + distance</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFilters((s) => !s)}
                        aria-expanded={showFilters}
                        aria-controls="filters"
                        className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-birch-300 hover:ring-pine-500"
                      >
                        <FilterIcon /> Filters
                        {filterCount > 0 ? (
                          <span className="rounded-full bg-pine-700 px-1.5 text-xs text-white">
                            {filterCount}
                            <span className="sr-only"> active</span>
                          </span>
                        ) : null}
                      </button>
                    </div>
                    {showFilters ? (
                      <div id="filters" className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-birch-200">
                        <FiltersPanel value={filters} onChange={setFilters} />
                      </div>
                    ) : null}
                    {sortMode === "weather" ? (
                      <p className="text-xs text-granite-600">
                        Weather-aware ranking uses the MET Norway forecast for the {WEATHER_LIMIT} closest trips. It
                        is a rough guide, not a safety assessment.
                      </p>
                    ) : null}
                  </div>

                  <TripResults
                    state={tripsState}
                    hasLocation={!!location}
                    favoritesOnly={filters.favoritesOnly}
                    trips={ranked}
                    totalBeforeFilters={filters.favoritesOnly ? favoriteIds.size : nearby.length}
                    radius={radius}
                    visibleCount={visibleCount}
                    onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    onIncreaseRadius={() => {
                      const next = RADIUS_OPTIONS.find((r) => r > radius);
                      if (next) changeRadius(next);
                    }}
                    onClearFilters={() => setFilters(EMPTY_FILTERS)}
                    onRetry={() => setRetryCount((c) => c + 1)}
                    renderCard={(trip) => (
                      <TripCard
                        key={trip.id}
                        trip={trip}
                        weather={weather.get(trip.id)}
                        isFavorite={favoriteIds.has(trip.id)}
                        isSelected={trip.id === selectedId}
                        onSelect={selectTrip}
                        onToggleFavorite={toggleFavorite}
                      />
                    )}
                  />
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

/** Only the derived values we persist for a trip (no geometry). */
function pickEnrichment(trip: HikingTrip | undefined): Partial<HikingTrip> {
  if (!trip) return {};
  const out: Partial<HikingTrip> = {};
  if (trip.lengthKm != null) {
    out.lengthKm = trip.lengthKm;
    out.lengthIsMeasured = trip.lengthIsMeasured;
  }
  if (trip.elevationGain != null) {
    out.elevationGain = trip.elevationGain;
    out.elevationGainIsMeasured = trip.elevationGainIsMeasured;
  }
  if (trip.estimatedTimeMinutes != null) {
    out.estimatedTimeMinutes = trip.estimatedTimeMinutes;
    out.estimatedTimeIsCalculated = trip.estimatedTimeIsCalculated;
  }
  return out;
}

function TripResults({
  state,
  hasLocation,
  favoritesOnly,
  trips,
  totalBeforeFilters,
  radius,
  visibleCount,
  onShowMore,
  onIncreaseRadius,
  onClearFilters,
  onRetry,
  renderCard,
}: {
  state: TripsState;
  hasLocation: boolean;
  favoritesOnly: boolean;
  trips: NearbyTrip[];
  totalBeforeFilters: number;
  radius: RadiusKm;
  visibleCount: number;
  onShowMore: () => void;
  onIncreaseRadius: () => void;
  onClearFilters: () => void;
  onRetry: () => void;
  renderCard: (trip: NearbyTrip) => React.ReactNode;
}) {
  if (!favoritesOnly) {
    if (!hasLocation) {
      return (
        <Notice title="Where do you want to hike?">
          Use “Locate me”, search for a place above, or pick a point on the map.
        </Notice>
      );
    }
    if (state.status === "loading" || state.status === "idle") {
      return (
        <div className="space-y-3" aria-busy="true">
          <p className="flex items-center gap-2 text-sm text-granite-700" role="status">
            <Spinner label="Finding trips" /> Finding trips within {radius} km…
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-birch-200 motion-reduce:animate-none" />
          ))}
        </div>
      );
    }
    if (state.status === "error") {
      return (
        <Notice
          tone="error"
          title="We couldn't load hiking trips right now."
          action={
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-full bg-lingon-700 px-4 text-sm font-semibold text-white"
            >
              Try again
            </button>
          }
        >
          The trip service may be busy, or you may be offline. Please try again in a moment.
        </Notice>
      );
    }
  }

  if (favoritesOnly && totalBeforeFilters === 0) {
    return <Notice title="No favourites yet">Tap the heart on a trip to save it here. Favourites are stored only on this device.</Notice>;
  }

  if (trips.length === 0) {
    if (totalBeforeFilters > 0) {
      return (
        <Notice
          title="No trips match your filters."
          action={
            <button type="button" onClick={onClearFilters} className="min-h-11 rounded-full bg-pine-700 px-4 text-sm font-semibold text-white">
              Clear filters
            </button>
          }
        />
      );
    }
    const canIncrease = radius < 100;
    return (
      <Notice
        title={`We couldn't find any trips within ${radius} km.`}
        action={
          canIncrease ? (
            <button type="button" onClick={onIncreaseRadius} className="min-h-11 rounded-full bg-pine-700 px-4 text-sm font-semibold text-white">
              Increase search radius
            </button>
          ) : undefined
        }
      >
        {canIncrease ? "Try increasing the search radius." : "Try searching for another place."}
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-granite-700" role="status">
        {favoritesOnly ? (
          <>{trips.length} saved {trips.length === 1 ? "trip" : "trips"}</>
        ) : (
          <>
            <span className="font-semibold">{trips.length}</span> {trips.length === 1 ? "trip" : "trips"} within {radius} km
            {trips.length !== totalBeforeFilters ? ` (filtered from ${totalBeforeFilters})` : ""}
          </>
        )}
        <span className="block text-xs text-granite-600">
          Distances are approximate straight-line distances from your starting point to each route&apos;s centre.
        </span>
      </p>
      {state.status === "ready" && state.partial ? (
        <Notice tone="warning" title="Some trip sources didn't respond, so the list may be incomplete." />
      ) : null}
      <ul className="space-y-3">
        {trips.slice(0, visibleCount).map((t) => (
          <li key={t.id}>{renderCard(t)}</li>
        ))}
      </ul>
      {trips.length > visibleCount ? (
        <button
          type="button"
          onClick={onShowMore}
          className="min-h-11 w-full rounded-2xl bg-white font-semibold text-pine-800 ring-1 ring-birch-300 hover:ring-pine-500"
        >
          Show more trips ({trips.length - visibleCount} more)
        </button>
      ) : null}
    </div>
  );
}
