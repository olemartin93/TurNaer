"use client";
import { useEffect, useState } from "react";
import { getTripById } from "@/services/hiking";
import { buildElevationProfile, type ElevationProfile } from "@/lib/trips/profile";
import { mainLine, nearestPointOnRoute, routeLengthKm } from "@/lib/geo/route";
import { naismithMinutes } from "@/lib/trips/estimate";
import { calculateDistance } from "@/lib/geo/distance";
import type { HikingTrip } from "@/types/trip";
import type { LatLon } from "@/types/geo";

export type TripDetailState = {
  status: "idle" | "loading" | "ready" | "error";
  trip: HikingTrip | null;
  /** Trailhead: route end nearest the user (or the source's start point). */
  start: LatLon | null;
  nearestRouteDistanceKm: number | null;
  profile: { status: "idle" | "loading" | "ready" | "unavailable"; data: ElevationProfile | null };
};

const initial: TripDetailState = {
  status: "idle",
  trip: null,
  start: null,
  nearestRouteDistanceKm: null,
  profile: { status: "idle", data: null },
};

/**
 * Load full details for the selected trip: route geometry (from its provider),
 * a start point, and an elevation profile from Kartverket's terrain model.
 * Derived values are flagged as measured/estimated so the UI can label them.
 */
export function useTripDetail(
  tripId: string | null,
  listTrip: HikingTrip | null,
  userLocation: LatLon | null,
  onEnriched: (trip: HikingTrip) => void,
): TripDetailState {
  // State is tagged with the trip it belongs to; anything else is derived as "loading".
  const [state, setState] = useState<TripDetailState & { forId: string | null }>({ ...initial, forId: null });

  useEffect(() => {
    if (!tripId) return;
    const controller = new AbortController();

    (async () => {
      let trip: HikingTrip | null = null;
      try {
        trip = (await getTripById(tripId, controller.signal)) ?? listTrip;
      } catch {
        trip = listTrip;
      }
      if (controller.signal.aborted) return;
      if (!trip) {
        setState({ ...initial, status: "error", forId: tripId });
        return;
      }

      let start: LatLon | null = trip.positionKind === "start" ? trip : null;
      let nearestKm: number | null = null;
      const route = trip.route;
      if (route) {
        if (trip.lengthKm == null) trip = { ...trip, lengthKm: routeLengthKm(route), lengthIsMeasured: true };
        const line = mainLine(route);
        const ends = [line[0], line[line.length - 1]]
          .filter((p): p is number[] => !!p)
          .map((p) => ({ latitude: p[1] ?? 0, longitude: p[0] ?? 0 }));
        if (!start && ends.length) {
          start = userLocation
            ? [...ends].sort((a, b) => calculateDistance(userLocation, a) - calculateDistance(userLocation, b))[0] ?? null
            : ends[0] ?? null;
        }
        if (userLocation) nearestKm = nearestPointOnRoute(route, userLocation)?.distanceKm ?? null;
      }
      setState({
        forId: tripId,
        status: "ready",
        trip,
        start,
        nearestRouteDistanceKm: nearestKm,
        profile: { status: trip.route ? "loading" : "unavailable", data: null },
      });

      if (!trip.route) {
        onEnriched(trip);
        return;
      }
      try {
        const profile = await buildElevationProfile(trip.id, trip.route, controller.signal);
        if (controller.signal.aborted) return;
        let enriched = trip;
        if (profile) {
          if (enriched.elevationGain == null) {
            enriched = { ...enriched, elevationGain: Math.round(profile.gainM), elevationGainIsMeasured: true };
          }
          if (enriched.estimatedTimeMinutes == null && enriched.lengthKm != null) {
            enriched = {
              ...enriched,
              estimatedTimeMinutes: naismithMinutes(enriched.lengthKm, profile.gainM),
              estimatedTimeIsCalculated: true,
            };
          }
        }
        setState((s) => ({
          ...s,
          trip: enriched,
          profile: { status: profile ? "ready" : "unavailable", data: profile },
        }));
        onEnriched(enriched);
      } catch {
        if (!controller.signal.aborted) {
          setState((s) => ({ ...s, profile: { status: "unavailable", data: null } }));
          onEnriched(trip);
        }
      }
    })();

    return () => controller.abort();
    // listTrip/userLocation intentionally read once per selected trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (!tripId) return initial;
  if (state.forId !== tripId) return { ...initial, status: "loading", trip: listTrip };
  return state;
}
