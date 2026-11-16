"use client";
import { useState } from "react";
import { clearAllCache } from "@/lib/cache";

export function ClearDataButton() {
  const [done, setDone] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          clearAllCache();
          try {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith("turnaer-data")).map((k) => caches.delete(k)));
          } catch {
            // Cache Storage unavailable
          }
          setDone(true);
        }}
        className="min-h-11 rounded-full bg-white px-4 font-semibold text-lingon-700 ring-1 ring-birch-300 hover:ring-lingon-700"
      >
        Clear data stored on this device
      </button>
      <p role="status" className="mt-2 text-sm text-granite-700">
        {done ? "Saved favourites, searches and cached data have been removed." : ""}
      </p>
    </div>
  );
}
