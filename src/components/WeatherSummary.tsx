import type { WeatherState } from "@/hooks/useWeather";
import { currentWeather } from "@/services/met/locationforecast";
import { weatherSymbol, windDirectionLabel } from "@/lib/weather/symbols";
import { assessWeather, conditionText } from "@/lib/weather/assessment";
import type { ConditionLevel } from "@/types/weather";
import { DropIcon, WindIcon } from "./Icons";

const levelStyles: Record<ConditionLevel, string> = {
  favorable: "bg-pine-50 text-pine-800 ring-pine-200",
  mixed: "bg-cloudberry-100 text-cloudberry-800 ring-cloudberry-500/30",
  challenging: "bg-lingon-50 text-lingon-700 ring-lingon-700/20",
};

export function ConditionBadge({ level }: { level: ConditionLevel }) {
  const t = conditionText[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${levelStyles[level]}`}
    >
      <span aria-hidden="true" className="font-black">
        {t.icon}
      </span>
      {t.short}
    </span>
  );
}

/** Compact current weather line for trip cards. */
export function WeatherSummary({ state }: { state: WeatherState | undefined }) {
  if (!state || state.status === "loading") {
    return <p className="h-5 w-40 animate-pulse rounded bg-birch-200 motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (state.status === "error") {
    return <p className="text-xs text-granite-600">Weather information is temporarily unavailable.</p>;
  }
  const now = currentWeather(state.forecast);
  if (!now) return null;
  const symbol = weatherSymbol(now.symbolCode);
  const assessment = assessWeather(state.forecast);
  const dir = windDirectionLabel(now.windFromDeg);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-granite-700">
      <span className="inline-flex items-center gap-1 font-semibold text-granite-900" title={symbol.label}>
        <span aria-hidden="true">{symbol.emoji}</span>
        <span className="sr-only">{symbol.label},</span>
        {now.temperatureC != null ? `${Math.round(now.temperatureC)}°C` : "–"}
      </span>
      {now.windSpeedMs != null ? (
        <span className="inline-flex items-center gap-1">
          <WindIcon className="text-granite-500" />
          <span className="sr-only">Wind</span>
          {Math.round(now.windSpeedMs)} m/s{dir ? ` ${dir}` : ""}
        </span>
      ) : null}
      {now.precipitationProbabilityPct != null ? (
        <span className="inline-flex items-center gap-1">
          <DropIcon className="text-fjord-600" />
          <span className="sr-only">Chance of precipitation</span>
          {Math.round(now.precipitationProbabilityPct)}%
        </span>
      ) : now.precipitationMm != null ? (
        <span className="inline-flex items-center gap-1">
          <DropIcon className="text-fjord-600" />
          <span className="sr-only">Precipitation next hour</span>
          {now.precipitationMm} mm
        </span>
      ) : null}
      {assessment ? <ConditionBadge level={assessment.level} /> : null}
    </div>
  );
}
