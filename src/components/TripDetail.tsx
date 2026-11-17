"use client";
import { useEffect, useState } from "react";
import type { TripDetailState } from "@/hooks/useTripDetail";
import type { WeatherState } from "@/hooks/useWeather";
import type { HikingTrip } from "@/types/trip";
import { calculateDistance } from "@/lib/geo/distance";
import { difficultyLabel, formatDuration, formatKm, formatMetres } from "@/lib/trips/format";
import { assessWeather, conditionText } from "@/lib/weather/assessment";
import { weatherSymbol, windDirectionLabel } from "@/lib/weather/symbols";
import { currentWeather } from "@/services/met/locationforecast";
import { getPointElevation } from "@/services/kartverket/elevation";
import type { LatLon } from "@/types/geo";
import { ElevationProfile } from "./ElevationProfile";
import { ArrowLeftIcon, ExternalIcon, HeartIcon, ShareIcon } from "./Icons";
import { Notice } from "./Notice";
import { Spinner } from "./Spinner";
import { ConditionBadge } from "./WeatherSummary";
import { KindBadge } from "./TripFacts";

/** Terrain height at a summit from Kartverket's elevation model (independent of the source's `ele` tag). */
function useSummitTerrain(trip: HikingTrip | null): { tripId: string; elevationM: number | null } | null {
  const [result, setResult] = useState<{ tripId: string; elevationM: number | null } | null>(null);
  const summitId = trip?.kind === "summit" ? trip.id : null;
  const lat = trip?.latitude;
  const lon = trip?.longitude;
  useEffect(() => {
    if (!summitId || lat == null || lon == null) return;
    const controller = new AbortController();
    getPointElevation({ latitude: lat, longitude: lon }, controller.signal)
      .then((s) => setResult({ tripId: summitId, elevationM: s.elevationM }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ tripId: summitId, elevationM: null });
      });
    return () => controller.abort();
  }, [summitId, lat, lon]);
  return result && result.tripId === summitId ? result : null;
}

type Props = {
  detail: TripDetailState;
  weather: WeatherState | undefined;
  userLocation: LatLon | null;
  isFavorite: boolean;
  onToggleFavorite: (trip: HikingTrip) => void;
  onBack: () => void;
  onHoverPoint: (p: LatLon | null) => void;
};

function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-birch-200 py-2 last:border-0">
      <dt className="text-sm text-granite-600">{label}</dt>
      <dd className="text-right font-semibold text-granite-900">
        {value}
        {note ? <span className="block text-xs font-normal text-granite-600">{note}</span> : null}
      </dd>
    </div>
  );
}

const unknown = <span className="font-normal text-granite-600">Not stated</span>;

function WeatherPanel({ state }: { state: WeatherState | undefined }) {
  const [now] = useState(() => Date.now());
  if (!state || state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-granite-600">
        <Spinner label="Loading weather" /> Loading forecast…
      </p>
    );
  }
  if (state.status === "error") return <p className="text-sm text-granite-600">Weather information is temporarily unavailable.</p>;
  const current = currentWeather(state.forecast);
  const assessment = assessWeather(state.forecast);
  const upcoming = state.forecast.points
    .filter((p) => Date.parse(p.time) >= now - 30 * 60 * 1000)
    .filter((_, i) => i % 2 === 0)
    .slice(0, 6);
  const stale = state.forecast.expiresAt < now;
  const symbol = weatherSymbol(current?.symbolCode);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex items-center gap-4">
          <span className="text-5xl" aria-hidden="true">
            {symbol.emoji}
          </span>
          <div>
            <p className="text-3xl font-bold">
              {current.temperatureC != null ? `${Math.round(current.temperatureC)}°C` : "–"}
            </p>
            <p className="text-sm text-granite-700">{symbol.label}</p>
          </div>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-granite-600">Wind</dt>
            <dd className="font-semibold">
              {current.windSpeedMs != null ? `${Math.round(current.windSpeedMs)} m/s` : "–"}
              {windDirectionLabel(current.windFromDeg) ? ` from ${windDirectionLabel(current.windFromDeg)}` : ""}
            </dd>
            {current.windGustMs != null ? (
              <>
                <dt className="text-granite-600">Gusts</dt>
                <dd className="font-semibold">{Math.round(current.windGustMs)} m/s</dd>
              </>
            ) : null}
            <dt className="text-granite-600">Precipitation</dt>
            <dd className="font-semibold">
              {current.precipitationProbabilityPct != null ? `${Math.round(current.precipitationProbabilityPct)}%` : ""}
              {current.precipitationMm != null ? ` · ${current.precipitationMm} mm` : ""}
            </dd>
            {current.fogPct != null ? (
              <>
                <dt className="text-granite-600">Fog</dt>
                <dd className="font-semibold">{Math.round(current.fogPct)}%</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
      {assessment ? (
        <div className="rounded-xl bg-birch-100 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <ConditionBadge level={assessment.level} />
            <span className="font-semibold">{conditionText[assessment.level].title}</span>
          </div>
          {assessment.reasons.length ? (
            <ul className="mt-1.5 list-disc pl-5 text-granite-700">
              {assessment.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-xs text-granite-600">
            Based on the next 6 hours of the MET Norway forecast. This is not a safety assessment — always check
            conditions, the official forecast and avalanche warnings (varsom.no) yourself.
          </p>
        </div>
      ) : null}
      {upcoming.length > 1 ? (
        <ol className="grid grid-cols-6 gap-1 text-center text-xs" aria-label="Forecast for the coming hours">
          {upcoming.map((p) => {
            const s = weatherSymbol(p.symbolCode);
            return (
              <li key={p.time} className="rounded-lg bg-white py-2 ring-1 ring-birch-200">
                <span className="block text-granite-600">{time.format(new Date(p.time))}</span>
                <span className="block text-lg" role="img" aria-label={s.label}>
                  {s.emoji}
                </span>
                <span className="block font-semibold">{p.temperatureC != null ? `${Math.round(p.temperatureC)}°` : "–"}</span>
                <span className="block text-granite-600">{p.windSpeedMs != null ? `${Math.round(p.windSpeedMs)} m/s` : ""}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="text-xs text-granite-600">
        {stale ? "Showing a saved forecast that may be out of date. " : ""}Forecast for the trip location from MET
        Norway.
      </p>
    </div>
  );
}

export function TripDetail({ detail, weather, userLocation, isFavorite, onToggleFavorite, onBack, onHoverPoint }: Props) {
  const [shareMessage, setShareMessage] = useState("");
  const trip = detail.trip;
  const summitTerrain = useSummitTerrain(trip);

  if (detail.status === "error" || (!trip && detail.status !== "loading")) {
    return (
      <div className="space-y-4 p-4">
        <BackButton onBack={onBack} />
        <Notice tone="error" title="We couldn't load this trip right now.">
          It may have been removed from the source, or you may be offline.
        </Notice>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="flex items-center gap-2 p-6 text-granite-700">
        <Spinner label="Loading trip" /> Loading trip…
      </div>
    );
  }

  const distFromUser = userLocation ? calculateDistance(userLocation, detail.start ?? trip) : null;
  const profile = detail.profile.data;

  const share = async () => {
    const url = new URL(window.location.href);
    url.search = `?trip=${encodeURIComponent(trip.id)}`;
    url.hash = "";
    const shareUrl = url.toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${trip.name} – TurNær`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Link copied to clipboard.");
    } catch {
      setShareMessage("");
    }
  };

  return (
    <article className="space-y-5 p-4" aria-labelledby="trip-title">
      <div className="flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={share}
            className="grid size-11 place-items-center rounded-full text-xl text-granite-700 hover:bg-birch-200"
            aria-label="Share this trip"
          >
            <ShareIcon />
          </button>
          <button
            type="button"
            onClick={() => onToggleFavorite(trip)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? "Remove from favourites" : "Save as favourite"}
            className={`grid size-11 place-items-center rounded-full text-xl hover:bg-birch-200 ${
              isFavorite ? "text-lingon-700" : "text-granite-700"
            }`}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {shareMessage}
      </p>
      {shareMessage ? <p className="text-sm text-pine-700">{shareMessage}</p> : null}

      <header className="space-y-1">
        <KindBadge kind={trip.kind} />
        <h2 id="trip-title" className="text-2xl font-extrabold tracking-tight text-granite-900">
          {trip.name}
        </h2>
        {distFromUser != null ? (
          <p className="text-granite-700">
            <span className="font-semibold">{formatKm(distFromUser)}</span> from you{" "}
            <span className="text-sm text-granite-600">
              (straight line to the{" "}
              {trip.kind === "summit" ? "summit" : detail.start ? "nearest end of the route" : "route centre"}, not walking
              distance)
            </span>
          </p>
        ) : null}
        {trip.ref || trip.operator ? (
          <p className="text-sm text-granite-600">{[trip.ref, trip.operator].filter(Boolean).join(" · ")}</p>
        ) : null}
      </header>

      {trip.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={trip.imageUrl} alt="" className="max-h-56 w-full rounded-2xl object-cover" referrerPolicy="no-referrer" />
      ) : null}

      {trip.description ? <p className="text-granite-800">{trip.description}</p> : null}

      <a
        href={trip.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-pine-700 px-5 text-base font-bold text-white shadow-card hover:bg-pine-800"
      >
        {trip.source === "turrutebasen" ? "Show on Norgeskart" : `Open trip on ${trip.sourceLabel}`}
        <ExternalIcon />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      {trip.websiteUrl ? (
        <a
          href={trip.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="-mt-2 flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-fjord-700 hover:underline"
        >
          Route website ({new URL(trip.websiteUrl).hostname.replace(/^www\./, "")})
          <ExternalIcon />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}

      <section aria-labelledby="facts-h" className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-birch-200">
        <h3 id="facts-h" className="mb-1 font-bold">
          Trip facts
        </h3>
        {trip.kind === "summit" ? (
          <dl>
            <Row
              label="Summit height"
              value={trip.summitElevationM != null ? `${formatMetres(trip.summitElevationM)} a.s.l.` : unknown}
              note={trip.summitElevationM != null ? "From OpenStreetMap" : undefined}
            />
            <Row label="Route to the top" value={unknown} note="Check the source or the marked-trails map layer" />
            <Row label="Source" value={trip.sourceLabel} />
          </dl>
        ) : (
        <dl>
          <Row
            label="Route length"
            value={trip.lengthKm != null ? formatKm(trip.lengthKm) : unknown}
            note={trip.lengthIsMeasured ? "Measured from the mapped route" : undefined}
          />
          <Row
            label="Elevation gain"
            value={
              trip.elevationGain != null ? `${trip.elevationGainIsMeasured ? "≈ " : ""}+${formatMetres(trip.elevationGain)}` : detail.profile.status === "loading" ? <Spinner label="Calculating" /> : unknown
            }
            note={trip.elevationGainIsMeasured ? "Calculated from Kartverket terrain data, one direction" : undefined}
          />
          <Row
            label="Difficulty"
            value={trip.difficulty ? difficultyLabel[trip.difficulty] : unknown}
            note={trip.difficultySource}
          />
          <Row
            label="Duration"
            value={
              trip.estimatedTimeMinutes != null
                ? `${trip.estimatedTimeIsCalculated ? "≈ " : ""}${formatDuration(trip.estimatedTimeMinutes)}`
                : unknown
            }
            note={trip.estimatedTimeIsCalculated ? "Estimate using Naismith's rule, one direction" : undefined}
          />
          {trip.marked ? <Row label="Waymarked" value="Yes" note="According to the source" /> : null}
          {trip.network ? <Row label="Network" value={networkLabel(trip.network)} /> : null}
          <Row
            label="Source"
            value={trip.source === "turrutebasen" ? "Kartverket" : trip.sourceLabel}
            note={trip.dataProvider !== trip.sourceLabel ? `Data: ${trip.dataProvider}` : undefined}
          />
        </dl>
        )}
      </section>

      <section aria-labelledby="terrain-h" className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-birch-200">
        <h3 id="terrain-h" className="mb-2 font-bold">
          Terrain
        </h3>
        {trip.kind === "summit" ? (
          summitTerrain ? (
            summitTerrain.elevationM != null ? (
              <p className="text-granite-800">
                Terrain height at the summit: <strong>{formatMetres(summitTerrain.elevationM)}</strong>
                <span className="block text-xs text-granite-600">From Kartverket&apos;s elevation model.</span>
              </p>
            ) : (
              <p className="text-sm text-granite-600">Elevation data is unavailable for this location.</p>
            )
          ) : (
            <p className="flex items-center gap-2 text-sm text-granite-600">
              <Spinner label="Loading terrain" /> Loading terrain data…
            </p>
          )
        ) : detail.status === "loading" || detail.profile.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-granite-600">
            <Spinner label="Loading terrain" /> Loading route and terrain data…
          </p>
        ) : profile ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-birch-100 p-2">
                <dt className="text-xs text-granite-600">Highest point</dt>
                <dd className="font-bold">{formatMetres(profile.maxM)}</dd>
              </div>
              <div className="rounded-xl bg-birch-100 p-2">
                <dt className="text-xs text-granite-600">Lowest point</dt>
                <dd className="font-bold">{formatMetres(profile.minM)}</dd>
              </div>
              <div className="rounded-xl bg-birch-100 p-2">
                <dt className="text-xs text-granite-600">Ascent</dt>
                <dd className="font-bold">≈ +{formatMetres(profile.gainM)}</dd>
              </div>
            </dl>
            <ElevationProfile profile={profile} onHoverPoint={onHoverPoint} />
          </div>
        ) : (
          <p className="text-sm text-granite-600">
            Elevation data is unavailable for this trip
            {trip.route ? " (the terrain model returned no data for this route)." : " (no route geometry is available)."}
          </p>
        )}
      </section>

      <section aria-labelledby="weather-h" className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-birch-200">
        <h3 id="weather-h" className="mb-2 font-bold">
          Weather
        </h3>
        <WeatherPanel state={weather} />
      </section>
    </article>
  );
}

function networkLabel(network: string): string {
  const map: Record<string, string> = {
    lwn: "Local route",
    rwn: "Regional route",
    nwn: "National route",
    iwn: "International route",
  };
  return map[network] ?? network;
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold text-granite-800 hover:bg-birch-200"
    >
      <ArrowLeftIcon /> Back to trips
    </button>
  );
}
