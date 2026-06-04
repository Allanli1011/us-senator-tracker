const dayMs = 24 * 60 * 60 * 1000;

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  return Math.round((parseIsoDate(later).getTime() - parseIsoDate(earlier).getTime()) / dayMs);
}

export function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
