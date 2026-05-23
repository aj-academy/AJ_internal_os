import { formatInr } from "@/components/finance/financeHelpers";

export { formatInr };

export function isMissingTable(msg: string, tableHint: string) {
  const m = msg.toLowerCase();
  return (
    (m.includes("could not find the table") && m.includes(tableHint)) ||
    (m.includes("relation") && m.includes(tableHint) && m.includes("does not exist")) ||
    (m.includes("pgrst205") && m.includes(tableHint))
  );
}

export function friendlyReportsError(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function minutesToHoursLabel(mins: number | null | undefined) {
  if (mins == null || Number.isNaN(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
