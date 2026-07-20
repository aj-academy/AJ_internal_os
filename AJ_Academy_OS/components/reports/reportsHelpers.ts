import { formatInr } from "@/components/finance/financeHelpers";
import type { SchemaGap } from "@/lib/reports/types";

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

export function formatCallDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return "— (not recorded)";
  const m = Math.floor(seconds / 60);
  const s = Math.abs(seconds % 60);
  return `~${m}m ${s}s`;
}

export function gapForObject(gaps: SchemaGap[], objectHint: string) {
  const h = objectHint.toLowerCase();
  return gaps.find((g) => g.object.toLowerCase().includes(h));
}

export function formatSchemaGap(gap: SchemaGap) {
  const parts = [`${gap.kind.replace(/_/g, " ").toUpperCase()}: ${gap.object}`, gap.reason];
  if (gap.migration) parts.push(`Required migration: ${gap.migration}`);
  return parts.join(" — ");
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
