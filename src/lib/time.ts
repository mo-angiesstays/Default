import { DateTime } from "luxon";

/** Combines a calendar date with an "HH:mm" wall time in a named zone. */
export function atLocalTime(date: Date, hhmm: string, zone: string): Date {
  const [hour = 0, minute = 0] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return DateTime.fromJSDate(date, { zone })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function startOfLocalDay(date: Date, zone: string): Date {
  return DateTime.fromJSDate(date, { zone }).startOf("day").toJSDate();
}

export function endOfLocalDay(date: Date, zone: string): Date {
  return DateTime.fromJSDate(date, { zone }).endOf("day").toJSDate();
}

/** 0 = Sunday … 6 = Saturday, in the given zone. */
export function localDayOfWeek(date: Date, zone: string): number {
  return DateTime.fromJSDate(date, { zone }).weekday % 7;
}

/** Minutes since local midnight. */
export function localMinutes(date: Date, zone: string): number {
  const dt = DateTime.fromJSDate(date, { zone });
  return dt.hour * 60 + dt.minute;
}

export function formatInZone(date: Date, zone: string, format = "ccc d LLL, h:mm a"): string {
  return DateTime.fromJSDate(date, { zone }).toFormat(format);
}

export function isoDate(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone }).toISODate() ?? "";
}

export function sameLocalDay(a: Date, b: Date, zone: string): boolean {
  return isoDate(a, zone) === isoDate(b, zone);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** "3h 25m" */
export function humanDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
