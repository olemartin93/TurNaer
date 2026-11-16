export type WeatherPoint = {
  time: string;
  temperatureC?: number;
  windSpeedMs?: number;
  windGustMs?: number;
  windFromDeg?: number;
  cloudCoverPct?: number;
  fogPct?: number;
  humidityPct?: number;
  /** Symbol code for the following hour (or 6 hours, if hourly is missing). */
  symbolCode?: string;
  /** Precipitation amount in mm for the following hour. */
  precipitationMm?: number;
  /** Probability of precipitation (%) for the following hour, when provided. */
  precipitationProbabilityPct?: number;
  /** Probability of thunder (%) for the following hour, when provided. */
  thunderProbabilityPct?: number;
};

export type WeatherForecast = {
  latitude: number;
  longitude: number;
  updatedAt?: string;
  /** Millisecond timestamp after which the data should be refreshed. */
  expiresAt: number;
  points: WeatherPoint[];
};

export type ConditionLevel = "favorable" | "mixed" | "challenging";

export type WeatherAssessment = {
  level: ConditionLevel;
  /** Short reasons, e.g. "Strong wind (15 m/s)". */
  reasons: string[];
  /** Summary values for the next hours. */
  maxWindMs?: number;
  totalPrecipMm?: number;
  maxPrecipProbabilityPct?: number;
  minTempC?: number;
  maxTempC?: number;
};
