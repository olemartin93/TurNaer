/**
 * Naismith's rule: 5 km per hour plus 1 hour per 600 m of ascent.
 * Used only when the source gives no duration, and always labelled as an estimate.
 */
export function naismithMinutes(lengthKm: number, ascentM = 0): number {
  return (lengthKm / 5) * 60 + (Math.max(0, ascentM) / 600) * 60;
}
