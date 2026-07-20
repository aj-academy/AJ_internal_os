/** Shared date presets for Reports & Analytics (server + client). */

export type ReportDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export type ReportDateRange = {
  preset: ReportDatePreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function resolveReportDateRange(
  preset: ReportDatePreset,
  customFrom?: string,
  customTo?: string,
  now = new Date(),
): ReportDateRange {
  const today = isoDate(now);
  if (preset === "today") return { preset, from: today, to: today };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = isoDate(y);
    return { preset, from: ys, to: ys };
  }
  if (preset === "this_week") {
    const start = startOfWeekMonday(now);
    return { preset, from: isoDate(start), to: today };
  }
  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { preset, from: isoDate(start), to: today };
  }
  const from = customFrom && customFrom <= (customTo || customFrom) ? customFrom : today;
  const to = customTo && customTo >= from ? customTo : from;
  return { preset: "custom", from, to };
}

export function dateInRange(iso: string | null | undefined, from: string, to: string) {
  if (!iso) return false;
  const d = String(iso).slice(0, 10);
  return d >= from && d <= to;
}

/** Inclusive end-of-day timestamptz bound for PostgREST filters. */
export function endOfDayIso(dateYmd: string) {
  return `${dateYmd}T23:59:59.999Z`;
}

export function startOfDayIso(dateYmd: string) {
  return `${dateYmd}T00:00:00.000Z`;
}
