"use client";
import {
  DURATION_BUCKETS,
  ELEVATION_BUCKETS,
  EMPTY_FILTERS,
  type TripFilters,
} from "@/lib/trips/filters";
import { difficultyLabel } from "@/lib/trips/format";
import type { Difficulty } from "@/types/trip";

const DIFFICULTIES: Difficulty[] = ["easy", "moderate", "hard", "expert"];

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-medium ring-1 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-fjord-600 ${
        checked ? "bg-pine-700 text-white ring-pine-700" : "bg-white text-granite-800 ring-birch-300 hover:ring-pine-500"
      }`}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <span aria-hidden="true">{checked ? "✓" : "+"}</span>
      {children}
    </label>
  );
}

export function FiltersPanel({ value, onChange }: { value: TripFilters; onChange: (f: TripFilters) => void }) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-granite-800">Difficulty</legend>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              checked={value.difficulties.includes(d)}
              onChange={() => onChange({ ...value, difficulties: toggle(value.difficulties, d) })}
            >
              {difficultyLabel[d]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-granite-800">Duration</legend>
        <div className="flex flex-wrap gap-2">
          {DURATION_BUCKETS.map((b) => (
            <Chip
              key={b.id}
              checked={value.durations.includes(b.id)}
              onChange={() => onChange({ ...value, durations: toggle(value.durations, b.id) })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-granite-800">Elevation gain</legend>
        <div className="flex flex-wrap gap-2">
          {ELEVATION_BUCKETS.map((b) => (
            <Chip
              key={b.id}
              checked={value.elevations.includes(b.id)}
              onChange={() => onChange({ ...value, elevations: toggle(value.elevations, b.id) })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2 border-t border-birch-200 pt-3">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-pine-700"
            checked={value.includeUnknown}
            onChange={(e) => onChange({ ...value, includeUnknown: e.target.checked })}
          />
          Include trips where this information is unknown
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-pine-700"
            checked={value.favoritesOnly}
            onChange={(e) => onChange({ ...value, favoritesOnly: e.target.checked })}
          />
          Show favourites only
        </label>
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="min-h-11 rounded-full px-3 text-sm font-semibold text-fjord-700 underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      </div>
      <p className="text-xs text-granite-600">
        Many routes don&apos;t state difficulty or duration. Values marked ≈ are estimates calculated from the route and
        Kartverket terrain data once you open a trip.
      </p>
    </div>
  );
}
