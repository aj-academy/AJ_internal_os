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

export type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export type AnalyticsFilters = {
  preset: DatePreset;
  from: string;
  to: string;
  employeeIds: string[];
  departments: string[];
  roles: string[];
  courses: string[];
  leadSources: string[];
  leadStatuses: string[];
  taskStatuses: string[];
  admissionStatuses: string[];
  search: string;
  page?: number;
  pageSize?: number;
};

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  preset: "today",
  from: "",
  to: "",
  employeeIds: [],
  departments: [],
  roles: [],
  courses: [],
  leadSources: [],
  leadStatuses: [],
  taskStatuses: [],
  admissionStatuses: [],
  search: "",
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
