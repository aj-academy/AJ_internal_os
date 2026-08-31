export type AnalyticsSectionId =
  | "overview"
  | "daily"
  | "team"
  | "calls"
  | "followups"
  | "tasks"
  | "conversion"
  | "admissions"
  | "revenue"
  | "timeline"
  | "productivity"
  | "eod"
  | "download";

export const ANALYTICS_SECTION_ORDER: AnalyticsSectionId[] = [
  "overview",
  "daily",
  "team",
  "calls",
  "followups",
  "tasks",
  "conversion",
  "admissions",
  "revenue",
  "timeline",
  "productivity",
  "eod",
  "download",
];

export const ANALYTICS_SECTION_LABELS: Record<AnalyticsSectionId, string> = {
  overview: "Dashboard Overview",
  daily: "Daily Employee Report",
  team: "Team Performance",
  calls: "Call Activity",
  followups: "Follow-up Report",
  tasks: "Task Completion",
  conversion: "Lead Conversion",
  admissions: "Admission Report",
  revenue: "Revenue Report",
  timeline: "Employee Timeline",
  productivity: "Productivity Report",
  eod: "End Of Day Tracker",
  download: "Download Centre",
};

/** Query-param value for a report, e.g. /admin/reports?report=daily-employee */
export const ANALYTICS_SECTION_SLUGS: Record<AnalyticsSectionId, string> = {
  overview: "dashboard",
  daily: "daily-employee",
  team: "team-performance",
  calls: "call-activity",
  followups: "follow-up",
  tasks: "task-completion",
  conversion: "lead-conversion",
  admissions: "admission",
  revenue: "revenue",
  timeline: "employee-timeline",
  productivity: "productivity",
  eod: "end-of-day",
  download: "download-centre",
};

const SLUG_TO_SECTION: Record<string, AnalyticsSectionId> = Object.fromEntries(
  Object.entries(ANALYTICS_SECTION_SLUGS).map(([id, slug]) => [slug, id as AnalyticsSectionId]),
);

/** Accepts a slug or a raw section id so old links keep working. */
export function parseSectionParam(value: string | null | undefined): AnalyticsSectionId | null {
  const key = (value || "").trim().toLowerCase();
  if (!key) return null;
  if (SLUG_TO_SECTION[key]) return SLUG_TO_SECTION[key];
  if (key in ANALYTICS_SECTION_SLUGS) return key as AnalyticsSectionId;
  return null;
}

export type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export type AnalyticsFilters = {
  from: string;
  to: string;
  /** Global filters. */
  employeeIds: string[];
  departments: string[];
  roles: string[];
  search: string;
  /**
   * Report-specific secondary filters. Not shown globally — each appears only
   * inside the report that needs it. `courses` and `leadSources` remain part of
   * the API contract for older callers but have no global UI.
   */
  leadStatuses: string[];
  taskStatuses: string[];
  admissionStatuses: string[];
  courses: string[];
  leadSources: string[];
  page?: number;
  pageSize?: number;
};

/** Secondary filter keys, by the report that owns them. */
export const REPORT_SECONDARY_FILTERS: Partial<Record<AnalyticsSectionId, keyof AnalyticsFilters>> = {
  conversion: "leadStatuses",
  admissions: "admissionStatuses",
  tasks: "taskStatuses",
};

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  from: "",
  to: "",
  employeeIds: [],
  departments: [],
  roles: [],
  search: "",
  leadStatuses: [],
  taskStatuses: [],
  admissionStatuses: [],
  courses: [],
  leadSources: [],
  page: 1,
  pageSize: 50,
};

export function asFilterList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((x) => String(x).trim()).filter(Boolean))];
  }
  if (typeof value === "string" && value.trim()) {
    if (value.includes(",")) {
      return [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))];
    }
    return [value.trim()];
  }
  return [];
}
