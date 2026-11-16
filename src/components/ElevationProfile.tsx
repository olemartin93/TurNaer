"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ElevationProfile as Profile } from "@/lib/trips/profile";
import { formatMetres } from "@/lib/trips/format";

const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 28, left: 46 };

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
}

/**
 * Elevation profile drawn from real Kartverket terrain samples along the route.
 * Single series: no legend; hover/touch crosshair + a data table for screen readers.
 */
export function ElevationProfile({
  profile,
  onHoverPoint,
}: {
  profile: Profile;
  onHoverPoint?: (p: { latitude: number; longitude: number } | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(() => profile.points.filter((p) => p.elevationM != null), [profile]);
  const step = niceStep(Math.max(20, profile.maxM - profile.minM), 4);
  const yMin = Math.floor(profile.minM / step) * step;
  const yMax = Math.ceil(profile.maxM / step) * step || yMin + step;
  const xMax = profile.lengthKm || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (d: number) => PAD.left + (d / xMax) * innerW;
  const y = (z: number) => PAD.top + innerH - ((z - yMin) / (yMax - yMin)) * innerH;

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.distanceKm).toFixed(1)},${y(p.elevationM ?? 0).toFixed(1)}`).join("");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = first && last ? `${line}L${x(last.distanceKm)},${y(yMin)}L${x(first.distanceKm)},${y(yMin)}Z` : "";

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 0.001; v += step) yTicks.push(v);
  const xStep = niceStep(xMax, Math.max(2, Math.floor(innerW / 80)));
  const xTicks: number[] = [];
  for (let v = 0; v <= xMax + 0.001; v += xStep) xTicks.push(v);

  const hovered = hover != null ? pts[hover] : undefined;

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || pts.length === 0) return;
    const d = ((clientX - rect.left - PAD.left) / innerW) * xMax;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(p.distanceKm - d) < Math.abs((pts[best]?.distanceKm ?? 0) - d)) best = i;
    });
    setHover(best);
    const p = pts[best];
    if (p) onHoverPoint?.({ latitude: p.latitude, longitude: p.longitude });
  };
  const clear = () => {
    setHover(null);
    onHoverPoint?.(null);
  };

  const summary = `Elevation profile over ${xMax.toFixed(1)} km: lowest ${Math.round(profile.minM)} m, highest ${Math.round(
    profile.maxM,
  )} m, about ${Math.round(profile.gainM)} m of ascent.`;

  return (
    <figure className="space-y-2">
      <div
        ref={ref}
        className="relative touch-pan-y select-none"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={clear}
        onTouchStart={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
        onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
        onTouchEnd={clear}
      >
        <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block overflow-visible">
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="stroke-birch-200" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-granite-600 text-[11px]">
                {Math.round(v)} m
              </text>
            </g>
          ))}
          {xTicks.map((v) => (
            <text key={`x${v}`} x={x(v)} y={HEIGHT - 8} textAnchor="middle" className="fill-granite-600 text-[11px]">
              {Number(v.toFixed(1))} km
            </text>
          ))}
          <path d={area} className="fill-pine-500/15" />
          <path d={line} className="stroke-pine-700" fill="none" strokeWidth={2} strokeLinejoin="round" />
          {hovered ? (
            <g>
              <line
                x1={x(hovered.distanceKm)}
                x2={x(hovered.distanceKm)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                className="stroke-granite-500"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hovered.distanceKm)}
                cy={y(hovered.elevationM ?? 0)}
                r={5}
                className="fill-pine-700 stroke-white"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute top-0 rounded-lg bg-granite-900 px-2 py-1 text-xs font-semibold text-white shadow"
            style={{
              left: Math.min(Math.max(0, x(hovered.distanceKm) - 50), width - 100),
            }}
          >
            {formatMetres(hovered.elevationM ?? 0)} · {hovered.distanceKm.toFixed(1)} km
          </div>
        ) : null}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-granite-600">
        <span>
          Terrain elevation sampled along the route from Kartverket&apos;s elevation model
          {profile.coverage < 1 ? ` (${Math.round(profile.coverage * 100)}% of samples had data)` : ""}.
        </span>
        <button
          type="button"
          className="min-h-11 rounded-full px-3 font-semibold text-fjord-700 hover:underline"
          aria-expanded={showTable}
          onClick={() => setShowTable((s) => !s)}
        >
          {showTable ? "Hide data table" : "Show data table"}
        </button>
      </figcaption>
      {showTable ? (
        <div className="max-h-56 overflow-auto rounded-xl ring-1 ring-birch-200">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Elevation along the route</caption>
            <thead className="sticky top-0 bg-birch-100">
              <tr>
                <th scope="col" className="px-3 py-1.5">Distance</th>
                <th scope="col" className="px-3 py-1.5">Elevation</th>
              </tr>
            </thead>
            <tbody>
              {profile.points
                .filter((_, i) => i % 5 === 0 || i === profile.points.length - 1)
                .map((p) => (
                  <tr key={p.distanceKm} className="border-t border-birch-200">
                    <td className="px-3 py-1">{p.distanceKm.toFixed(2)} km</td>
                    <td className="px-3 py-1">{p.elevationM != null ? formatMetres(p.elevationM) : "No data"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
