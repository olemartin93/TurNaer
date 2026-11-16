"use client";
import { useEffect, useState } from "react";
import { getWeather } from "@/services/met/locationforecast";
import type { WeatherForecast } from "@/types/weather";

/** A trip with no entry in the map is still loading. */
export type WeatherState = { status: "loading" } | { status: "ready"; forecast: WeatherForecast } | { status: "error" };

type Target = { id: string; latitude: number; longitude: number };

const CONCURRENCY = 3;

/**
 * Fetch weather for a small set of targets (visible/relevant trips only).
 * Requests are de-duplicated and cached by the MET service module.
 */
export function useWeather(targets: Target[]): ReadonlyMap<string, WeatherState> {
  const [states, setStates] = useState<Map<string, WeatherState>>(new Map());
  const key = targets.map((t) => t.id).join("|");

  useEffect(() => {
    let cancelled = false;
    const pending = targets.filter((t) => {
      const s = states.get(t.id);
      return !s;
    });
    if (pending.length === 0) return;
    const queue = [...pending];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const target = t;
        try {
          const forecast = await getWeather(target);
          if (!cancelled) setStates((prev) => new Map(prev).set(target.id, { status: "ready", forecast }));
        } catch {
          if (!cancelled) setStates((prev) => new Map(prev).set(target.id, { status: "error" }));
        }
      }
    };
    void Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return () => {
      cancelled = true;
    };
    // `states` deliberately omitted: we only react to a changed target list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return states;
}
