import type { Difficulty } from "@/types/trip";

export const difficultyLabel: Record<Difficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  expert: "Expert",
};

const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function formatKm(km: number): string {
  if (km < 1) return `${nf0.format(Math.round(km * 1000 / 10) * 10)} m`;
  return `${km < 10 ? nf1.format(km) : nf0.format(km)} km`;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatMetres(m: number): string {
  return `${nf0.format(Math.round(m))} m`;
}
