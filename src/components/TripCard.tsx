"use client";
import type { NearbyTrip } from "@/types/trip";
import type { WeatherState } from "@/hooks/useWeather";
import { formatKm } from "@/lib/trips/format";
import { TripFacts } from "./TripFacts";
import { WeatherSummary } from "./WeatherSummary";
import { ExternalIcon, HeartIcon } from "./Icons";

type Props = {
  trip: NearbyTrip;
  weather: WeatherState | undefined;
  isFavorite: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (trip: NearbyTrip) => void;
};

export function TripCard({ trip, weather, isFavorite, isSelected, onSelect, onToggleFavorite }: Props) {
  return (
    <article
      className={`relative flex gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 transition hover:ring-pine-200 ${
        isSelected ? "ring-2 ring-pine-600" : "ring-birch-200"
      }`}
      aria-current={isSelected ? "true" : undefined}
    >
      {trip.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trip.imageUrl}
          alt=""
          loading="lazy"
          className="size-20 shrink-0 rounded-xl object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold leading-snug text-granite-900">
              <button
                type="button"
                onClick={() => onSelect(trip.id)}
                className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-fjord-600"
              >
                {trip.name}
              </button>
            </h3>
            {trip.distanceFromUserKm != null ? (
              <p className="text-sm text-granite-600">
                <span className="font-semibold text-granite-800">{formatKm(trip.distanceFromUserKm)}</span> from you
                <span className="sr-only"> (approximate straight-line distance)</span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onToggleFavorite(trip)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${trip.name} from favourites` : `Save ${trip.name} as favourite`}
            className={`relative z-10 -mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-birch-100 ${
              isFavorite ? "text-lingon-700" : "text-granite-500"
            }`}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </div>
        <TripFacts trip={trip} compact />
        <WeatherSummary state={weather} />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-granite-600">
            Source: {trip.source === "turrutebasen" ? "Kartverket" : trip.sourceLabel}
          </span>
          <a
            href={trip.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-pine-700 px-4 text-sm font-semibold text-white hover:bg-pine-800"
          >
            {trip.source === "turrutebasen" ? "View map" : "View trip"}
            <ExternalIcon />
            <span className="sr-only">on {trip.sourceLabel} (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </article>
  );
}
