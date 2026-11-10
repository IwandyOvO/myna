/** Season key for monthly boards. Seasons roll over at 00:00 UTC on the 1st. */
export function seasonOf(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysToSeasonEnd(d: Date = new Date()): number {
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(0, Math.ceil((end - d.getTime()) / 86_400_000));
}
