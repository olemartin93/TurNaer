import type { UserLocation } from "@/types/geo";

export type GeolocationFailure = "unsupported" | "denied" | "unavailable" | "timeout" | "insecure";

export class GeolocationError extends Error {
  constructor(readonly reason: GeolocationFailure) {
    super(reason);
    this.name = "GeolocationError";
  }
}

/**
 * Ask the browser for the current position. Must only be called in response to
 * an explicit user action ("Find trips near me"). The position never leaves the
 * browser except as rounded coordinates in weather/terrain/trip queries.
 */
export function getCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new GeolocationError("unsupported"));
      return;
    }
    if (!window.isSecureContext) {
      reject(new GeolocationError("insecure"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          origin: "gps",
        }),
      (err) => {
        const reason: GeolocationFailure =
          err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable";
        reject(new GeolocationError(reason));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

export const geolocationMessages: Record<GeolocationFailure, string> = {
  unsupported: "Your browser doesn't support location. Search for a place or pick a point on the map instead.",
  insecure: "Location is only available over a secure (https) connection. Search for a place instead.",
  denied:
    "Location access was turned off. You can allow it in your browser settings, or search for a place or pick a point on the map.",
  unavailable: "We couldn't determine your location. Search for a location instead.",
  timeout: "Finding your location took too long. Try again, or search for a location instead.",
};
