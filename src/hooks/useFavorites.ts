"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readPref, writePref } from "@/lib/cache";
import type { HikingTrip } from "@/types/trip";

/** Favourites are stored only in this browser (localStorage), with a snapshot for offline use. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Record<string, HikingTrip>>({});

  useEffect(() => {
    // Hydrate from browser storage after mount; the prerendered HTML has no access to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(readPref<Record<string, HikingTrip>>("favorites", {}));
  }, []);

  const toggle = useCallback((trip: HikingTrip) => {
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[trip.id]) delete next[trip.id];
      else {
        // Don't store full route geometry; keep the snapshot small.
        const { route: _route, ...rest } = trip;
        void _route;
        next[trip.id] = rest;
      }
      writePref("favorites", next);
      return next;
    });
  }, []);

  const ids = useMemo(() => new Set(Object.keys(favorites)), [favorites]);
  return { favorites, favoriteIds: ids, toggleFavorite: toggle };
}
