import type { DatePreset } from "@/lib/analytics/types";

const BUSINESS_TZ = "Asia/Kolkata";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date in the process timezone (legacy). Prefer toDateKeyIst for reports. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Business calendar date for AJ Academy reports (IST). */
export function toDateKeyIst(d = new Date()): string {
  // en-CA → YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function resolveDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  const today = toDateKeyIst();

  if (preset === "custom") {
    const from = (customFrom || today).slice(0, 10);
    const to = (customTo || today).slice(0, 10);
    return from <= to ? { from, to } : { from: to, to: from };
  }

  if (preset === "yesterday") {
    const y = new Date(`${today}T12:00:00+05:30`);
    y.setDate(y.getDate() - 1);
    const key = toDateKeyIst(y);
    return { from: key, to: key };
  }

  if (preset === "this_week") {
    const nowIst = new Date(`${today}T12:00:00+05:30`);
    const day = nowIst.getDay(); // 0 Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(nowIst);
    start.setDate(nowIst.getDate() + mondayOffset);
    return { from: toDateKeyIst(start), to: today };
  }

  if (preset === "this_month") {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }

  return { from: today, to: today };
}

/**
 * IST calendar days between two IST date keys, inclusive.
 * Anchored at IST midday so a UTC host cannot shift the day boundary.
 */
export function eachDateKey(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from.slice(0, 10)}T12:00:00+05:30`);
  const endKey = to.slice(0, 10);
  if (Number.isNaN(cur.getTime())) return out;
  // Guard against a reversed or malformed range running away.
  for (let i = 0; i < 3660; i += 1) {
    const key = toDateKeyIst(cur);
    if (key > endKey) break;
    out.push(key);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Weekday (Mon–Fri) IST date keys in a range. */
export function isWeekendKeyIst(dateKey: string): boolean {
  const day = new Date(`${dateKey.slice(0, 10)}T12:00:00+05:30`).getUTCDay();
  return day === 0 || day === 6;
}

/** Start of IST calendar day as UTC ISO (for timestamptz filters). */
export function isoStartOfDay(dateKey: string): string {
  return new Date(`${dateKey.slice(0, 10)}T00:00:00.000+05:30`).toISOString();
}

/** End of IST calendar day as UTC ISO (for timestamptz filters). */
export function isoEndOfDay(dateKey: string): string {
  return new Date(`${dateKey.slice(0, 10)}T23:59:59.999+05:30`).toISOString();
}
