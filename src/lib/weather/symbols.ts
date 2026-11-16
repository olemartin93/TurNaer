/**
 * Map MET Norway symbol codes (e.g. "partlycloudy_day", "heavyrainandthunder")
 * to an emoji and a text label. The label is always shown/announced so meaning
 * is never conveyed by the icon alone.
 */
type Symbol = { emoji: string; label: string };

const BASE: Record<string, Symbol> = {
  clearsky: { emoji: "☀️", label: "Clear sky" },
  fair: { emoji: "🌤️", label: "Fair" },
  partlycloudy: { emoji: "⛅", label: "Partly cloudy" },
  cloudy: { emoji: "☁️", label: "Cloudy" },
  fog: { emoji: "🌫️", label: "Fog" },
  lightrainshowers: { emoji: "🌦️", label: "Light rain showers" },
  rainshowers: { emoji: "🌦️", label: "Rain showers" },
  heavyrainshowers: { emoji: "🌧️", label: "Heavy rain showers" },
  lightrain: { emoji: "🌧️", label: "Light rain" },
  rain: { emoji: "🌧️", label: "Rain" },
  heavyrain: { emoji: "🌧️", label: "Heavy rain" },
  lightsleetshowers: { emoji: "🌨️", label: "Light sleet showers" },
  sleetshowers: { emoji: "🌨️", label: "Sleet showers" },
  heavysleetshowers: { emoji: "🌨️", label: "Heavy sleet showers" },
  lightsleet: { emoji: "🌨️", label: "Light sleet" },
  sleet: { emoji: "🌨️", label: "Sleet" },
  heavysleet: { emoji: "🌨️", label: "Heavy sleet" },
  lightsnowshowers: { emoji: "🌨️", label: "Light snow showers" },
  snowshowers: { emoji: "🌨️", label: "Snow showers" },
  heavysnowshowers: { emoji: "❄️", label: "Heavy snow showers" },
  lightsnow: { emoji: "🌨️", label: "Light snow" },
  snow: { emoji: "❄️", label: "Snow" },
  heavysnow: { emoji: "❄️", label: "Heavy snow" },
};

export function weatherSymbol(code: string | undefined): Symbol {
  if (!code) return { emoji: "🌡️", label: "Weather" };
  const base = code.replace(/_(day|night|polartwilight)$/, "");
  if (base.includes("thunder")) return { emoji: "⛈️", label: "Thunder" };
  const known = BASE[base];
  if (known) return known;
  return { emoji: "🌡️", label: base.replace(/([a-z])(showers|rain|snow|sleet)/, "$1 $2") };
}

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** "from SW" style label for a meteorological wind direction. */
export function windDirectionLabel(deg: number | undefined): string | undefined {
  if (deg == null) return undefined;
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
