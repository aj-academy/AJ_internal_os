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
  employeeId: string;
  department: string;
  role: string;
  course: string;
  leadSource: string;
  leadStatus: string;
  taskStatus: string;
  admissionStatus: string;
  search: string;
  page?: number;
  pageSize?: number;
};

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  preset: "today",
  from: "",
  to: "",
  employeeId: "",
  department: "",
  role: "",
  course: "",
  leadSource: "",
  leadStatus: "",
  taskStatus: "",
  admissionStatus: "",
  search: "",
  page: 1,
  pageSize: 50,
};
