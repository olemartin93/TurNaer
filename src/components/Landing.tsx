"use client";
import Link from "next/link";
import type { RadiusKm } from "@/lib/trips/filters";
import type { SearchResult } from "@/services/kartverket/geocoding";
import type { UserLocation } from "@/types/geo";
import { HeartIcon, LocateIcon, PinIcon } from "./Icons";
import { LocationSearch } from "./LocationSearch";
import { Notice } from "./Notice";
import { Spinner } from "./Spinner";

type Props = {
  locating: boolean;
  locationError: string | null;
  lastSearch: { location: UserLocation; radius: RadiusKm } | null;
  favoritesCount: number;
  onLocate: () => void;
  onSearchSelect: (r: SearchResult) => void;
  onPickOnMap: () => void;
  onResume: (l: { location: UserLocation; radius: RadiusKm }) => void;
  onShowFavorites: () => void;
};

function Mountains() {
  return (
    <svg
      viewBox="0 0 1440 320"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full sm:h-56"
    >
      <path d="M0 250 180 120l120 90 160-150 200 170 140-90 220 140 180-110 240 130v70H0z" fill="#aed0b8" opacity=".55" />
      <path d="M0 290 140 200l150 70 210-130 170 120 190-90 160 80 200-110 220 120v60H0z" fill="#3d7a4f" opacity=".7" />
      <path d="M0 320V300l200-60 180 50 240-70 200 60 230-50 190 40 200-40v90z" fill="#245033" />
    </svg>
  );
}

export function Landing(props: Props) {
  const { locating, locationError, lastSearch, favoritesCount } = props;
  return (
    <div className="h-full overflow-y-auto">
      <section className="relative overflow-hidden bg-gradient-to-b from-fjord-50 via-birch-50 to-birch-100 pb-44 sm:pb-60">
        <div className="mx-auto max-w-2xl px-4 pt-10 sm:pt-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-pine-800 ring-1 ring-pine-200">
            <span aria-hidden="true">🇳🇴</span> Hiking trips in Norway
          </p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-granite-900 sm:text-6xl">
            Find a great hike near you
          </h1>
          <p className="mt-4 text-lg text-granite-700 sm:text-xl">
            Discover hiking trips close to your current location — with weather from MET Norway, terrain from
            Kartverket and routes from OpenStreetMap.
          </p>

          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={props.onLocate}
              disabled={locating}
              className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-pine-700 px-6 text-lg font-bold text-white shadow-card transition hover:bg-pine-800 disabled:opacity-80 sm:w-auto"
            >
              {locating ? <Spinner label="Finding your location" /> : <LocateIcon className="text-2xl" />}
              {locating ? "Finding your location…" : "Find trips near me"}
            </button>
            <p className="max-w-xl text-sm text-granite-700">
              <strong className="font-semibold">Why we ask for your location:</strong> it is used only in your browser
              to find trips and weather near you. It is never stored on a server or shared for tracking; only rounded
              coordinates are sent to the public map and weather services.
            </p>
            {locationError ? <Notice tone="warning" title={locationError} /> : null}
          </div>

          <div className="mt-8 rounded-3xl bg-white/90 p-4 shadow-card ring-1 ring-birch-200 sm:p-5">
            <LocationSearch onSelect={props.onSearchSelect} label="Or search for a place or address" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onPickOnMap}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-fjord-700 ring-1 ring-birch-300 hover:bg-birch-50"
              >
                <PinIcon /> Choose a point on the map
              </button>
              {lastSearch ? (
                <button
                  type="button"
                  onClick={() => props.onResume(lastSearch)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-pine-800 ring-1 ring-birch-300 hover:bg-birch-50"
                >
                  ↺ Trips near {lastSearch.location.label ?? "your last location"}
                </button>
              ) : null}
              {favoritesCount > 0 ? (
                <button
                  type="button"
                  onClick={props.onShowFavorites}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-lingon-700 ring-1 ring-birch-300 hover:bg-birch-50"
                >
                  <HeartIcon filled /> Favourites ({favoritesCount})
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <Mountains />
      </section>

      <section aria-labelledby="how" className="bg-pine-800 text-white">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3">
          <h2 id="how" className="sr-only">
            How it works
          </h2>
          {[
            ["1", "Find nearby trips", "Real hiking routes around you, sorted by approximate distance."],
            ["2", "Check weather & terrain", "Forecasts from MET Norway and elevation profiles from Kartverket."],
            ["3", "Open the original trip", "Read the full description on Morotur, UT.no or OpenStreetMap."],
          ].map(([n, title, text]) => (
            <div key={n} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="grid size-9 place-items-center rounded-full bg-cloudberry-500 font-bold text-granite-900">{n}</p>
              <h3 className="mt-3 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-pine-100">{text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="bg-pine-900 px-4 py-6 text-center text-sm text-pine-100">
        Maps © Kartverket and © OpenStreetMap contributors · Weather © MET Norway ·{" "}
        <Link href="/about/" className="font-semibold text-white underline underline-offset-2">
          About &amp; data sources
        </Link>
        <p className="mt-1 text-pine-200">
          TurNær is an independent project and is not affiliated with Kartverket, MET Norway, Morotur or UT.no.
        </p>
      </footer>
    </div>
  );
}
