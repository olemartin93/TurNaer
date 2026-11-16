"use client";
import { useEffect } from "react";
import { BASE_PATH } from "@/lib/config";

/** Registers the generated service worker (production builds only). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {
      // Offline support is a progressive enhancement; ignore registration failures.
    });
  }, []);
  return null;
}
