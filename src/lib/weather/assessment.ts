/**
 * Rough, non-official reading of the forecast for the next hours.
 * This is NOT a safety recommendation; the UI words it as
 * "conditions appear favourable" / "may be challenging".
 */
import type { ConditionLevel, WeatherAssessment, WeatherForecast } from "@/types/weather";

const WINDOW_HOURS = 6;

export function assessWeather(forecast: WeatherForecast, now = Date.now()): WeatherAssessment | null {
  const from = now - 30 * 60 * 1000;
  const window = forecast.points
    .filter((p) => Date.parse(p.time) >= from)
    .slice(0, WINDOW_HOURS);
  if (window.length === 0) return null;

  const nums = (xs: (number | undefined)[]): number[] => xs.filter((x): x is number => typeof x === "number");
  const winds = nums(window.map((p) => p.windSpeedMs));
  const gusts = nums(window.map((p) => p.windGustMs));
  const temps = nums(window.map((p) => p.temperatureC));
  const precips = nums(window.map((p) => p.precipitationMm));
  const probs = nums(window.map((p) => p.precipitationProbabilityPct));
  const fogs = nums(window.map((p) => p.fogPct));
  const thunder =
    window.some((p) => p.symbolCode?.includes("thunder")) ||
    nums(window.map((p) => p.thunderProbabilityPct)).some((v) => v >= 30);

  const maxWind = winds.length ? Math.max(...winds) : undefined;
  const maxGust = gusts.length ? Math.max(...gusts) : undefined;
  const totalPrecip = precips.length ? precips.reduce((a, b) => a + b, 0) : undefined;
  const maxProb = probs.length ? Math.max(...probs) : undefined;
  const minTemp = temps.length ? Math.min(...temps) : undefined;
  const maxTemp = temps.length ? Math.max(...temps) : undefined;
  const maxFog = fogs.length ? Math.max(...fogs) : undefined;

  const challenging: string[] = [];
  const mixed: string[] = [];
  const r1 = (n: number) => Math.round(n * 10) / 10;

  if (thunder) challenging.push("Risk of thunder");
  if (maxWind != null && maxWind >= 14) challenging.push(`Strong wind (${Math.round(maxWind)} m/s)`);
  else if (maxGust != null && maxGust >= 20) challenging.push(`Strong gusts (${Math.round(maxGust)} m/s)`);
  else if (maxWind != null && maxWind >= 8) mixed.push(`Fresh wind (${Math.round(maxWind)} m/s)`);
  if (totalPrecip != null && totalPrecip >= 6) challenging.push(`Heavy precipitation (${r1(totalPrecip)} mm)`);
  else if (totalPrecip != null && totalPrecip >= 1) mixed.push(`Some precipitation (${r1(totalPrecip)} mm)`);
  else if (maxProb != null && maxProb >= 50) mixed.push(`Chance of precipitation (${Math.round(maxProb)}%)`);
  if (minTemp != null && minTemp <= -15) challenging.push(`Very cold (${Math.round(minTemp)}°C)`);
  else if (minTemp != null && minTemp <= -5) mixed.push(`Cold (${Math.round(minTemp)}°C)`);
  if (maxTemp != null && maxTemp >= 28) mixed.push(`Hot (${Math.round(maxTemp)}°C)`);
  if (maxFog != null && maxFog >= 50) mixed.push("Fog likely – reduced visibility");

  const level: ConditionLevel = challenging.length ? "challenging" : mixed.length ? "mixed" : "favorable";
  return {
    level,
    reasons: [...challenging, ...mixed],
    maxWindMs: maxWind,
    totalPrecipMm: totalPrecip,
    maxPrecipProbabilityPct: maxProb,
    minTempC: minTemp,
    maxTempC: maxTemp,
  };
}

export const conditionText: Record<ConditionLevel, { title: string; short: string; icon: string }> = {
  favorable: { title: "Weather conditions appear favourable.", short: "Good conditions", icon: "✓" },
  mixed: { title: "Weather conditions look mixed.", short: "Mixed conditions", icon: "~" },
  challenging: { title: "Weather conditions may be challenging.", short: "Challenging conditions", icon: "!" },
};
