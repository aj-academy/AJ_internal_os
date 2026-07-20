import type { DatePreset } from "@/lib/analytics/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const now = new Date();
  const today = toDateKey(now);

  if (preset === "custom") {
    const from = (customFrom || today).slice(0, 10);
    const to = (customTo || today).slice(0, 10);
    return from <= to ? { from, to } : { from: to, to: from };
  }

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const key = toDateKey(y);
    return { from: key, to: key };
  }

  if (preset === "this_week") {
    const day = now.getDay(); // 0 Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    return { from: toDateKey(start), to: today };
  }

  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toDateKey(start), to: today };
  }

  return { from: today, to: today };
}

export function eachDateKey(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = parseDateKey(from);
  const end = parseDateKey(to);
  while (cur <= end) {
    out.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function isoStartOfDay(dateKey: string): string {
  return `${dateKey}T00:00:00.000`;
}

export function isoEndOfDay(dateKey: string): string {
  return `${dateKey}T23:59:59.999`;
}
