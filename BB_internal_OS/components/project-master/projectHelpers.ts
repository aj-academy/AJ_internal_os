import type { ProjectRow, ProjectStatus } from "@/types/project";

export const PROJECT_SELECT = [
  "id",
  "project_code",
  "project_name",
  "client_id",
  "project_type",
  "description",
  "priority",
  "status",
  "start_date",
  "deadline",
  "estimated_completion",
  "budget",
  "advance_paid",
  "pending_amount",
  "project_manager",
  "assigned_team",
  "progress",
  "total_tasks",
  "completed_tasks",
  "delayed_tasks",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

export type ProjectRowLoose = Record<string, unknown> & ProjectRow;

export function displayClientName(c: { lead_name?: string | null; name?: string | null; company_name?: string | null }) {
  const n = (c.lead_name || c.name || "").trim();
  const co = (c.company_name || "").trim();
  if (n && co) return `${n} · ${co}`;
  return n || co || "—";
}

export function normalizeProjectStatus(s: string | null | undefined): ProjectStatus | string {
  const v = (s || "Planning").trim();
  return v || "Planning";
}

export function isDelayedProject(p: ProjectRowLoose, today: string): boolean {
  const st = String(p.status || "");
  if (st === "Completed" || st === "Cancelled") return false;
  const d = p.deadline ? String(p.deadline).slice(0, 10) : "";
  return Boolean(d && d < today);
}

export function friendlyProjectError(e: unknown) {
  const msg = e instanceof Error ? e.message : "Unexpected error.";
  if (msg.includes("Could not find") && msg.includes("projects")) {
    return "Run `BB_internal_SB/project_master_schema.sql` in Supabase (after clients + tasks). See DATABASE_SETUP_ORDER.txt.";
  }
  return msg;
}

export function isMissingProjectsTable(msg: string) {
  const m = msg.toLowerCase();
  return (
    (m.includes("could not find the table") && m.includes("projects")) ||
    (m.includes("relation") && m.includes("projects") && m.includes("does not exist")) ||
    (m.includes("schema cache") && m.includes("projects"))
  );
}
