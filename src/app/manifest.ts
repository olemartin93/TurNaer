import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/config";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE_PATH}/`,
    name: "TurNær – Hiking trips near you",
    short_name: "TurNær",
    description: "Discover hiking trips, trails, weather and terrain near your location in Norway.",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#f5f2ea",
    theme_color: "#245033",
    lang: "en",
    categories: ["travel", "sports", "weather", "navigation"],
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
