import type { Difficulty, HikingTrip, TripKind } from "@/types/trip";
import { difficultyLabel, formatDuration, formatKm, formatMetres } from "@/lib/trips/format";
import { ClockIcon, MountainIcon, RouteIcon } from "./Icons";

const difficultyStyle: Record<Difficulty, { cls: string; bars: number }> = {
  easy: { cls: "bg-pine-50 text-pine-800 ring-pine-200", bars: 1 },
  moderate: { cls: "bg-fjord-50 text-fjord-700 ring-fjord-600/20", bars: 2 },
  hard: { cls: "bg-cloudberry-100 text-cloudberry-800 ring-cloudberry-500/30", bars: 3 },
  expert: { cls: "bg-lingon-50 text-lingon-700 ring-lingon-700/20", bars: 4 },
};

/** Difficulty chip: text label + bar count, so it never relies on colour alone. */
export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const s = difficultyStyle[difficulty];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${s.cls}`}>
      <span aria-hidden="true" className="flex items-end gap-px">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= s.bars ? "bg-current" : "bg-current/25"}`} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {difficultyLabel[difficulty]}
    </span>
  );
}

export const kindLabel: Record<TripKind, string> = { route: "Route", trail: "Trail", summit: "Summit" };

const kindIcon: Record<TripKind, string> = { route: "⟿", trail: "⋯", summit: "▲" };

export function KindBadge({ kind }: { kind: TripKind }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-birch-200 px-2 py-0.5 text-xs font-semibold text-granite-800">
      <span aria-hidden="true">{kindIcon[kind]}</span>
      {kindLabel[kind]}
    </span>
  );
}

export function TripFacts({ trip, compact = false }: { trip: HikingTrip; compact?: boolean }) {
  const items: { key: string; icon: React.ReactNode; label: string; value: string }[] = [];
  if (trip.summitElevationM != null)
    items.push({ key: "ele", icon: <MountainIcon />, label: "Summit height", value: `${formatMetres(trip.summitElevationM)} a.s.l.` });
  if (trip.lengthKm != null)
    items.push({ key: "len", icon: <RouteIcon />, label: "Route length", value: formatKm(trip.lengthKm) });
  if (trip.estimatedTimeMinutes != null)
    items.push({
      key: "time",
      icon: <ClockIcon />,
      label: trip.estimatedTimeIsCalculated ? "Estimated duration" : "Duration",
      value: `${trip.estimatedTimeIsCalculated ? "≈ " : ""}${formatDuration(trip.estimatedTimeMinutes)}`,
    });
  if (trip.elevationGain != null)
    items.push({
      key: "gain",
      icon: <MountainIcon />,
      label: "Elevation gain",
      value: `${trip.elevationGainIsMeasured ? "≈ " : ""}+${formatMetres(trip.elevationGain)}`,
    });

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${compact ? "text-sm" : ""}`}>
      <KindBadge kind={trip.kind} />
      {trip.difficulty ? <DifficultyBadge difficulty={trip.difficulty} /> : null}
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1 text-granite-700" title={i.label}>
          <span className="text-granite-500">{i.icon}</span>
          <span className="sr-only">{i.label}:</span>
          {i.value}
        </span>
      ))}

    </div>
  );
}
