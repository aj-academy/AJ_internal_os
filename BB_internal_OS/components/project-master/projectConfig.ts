import type { ProjectPriority, ProjectStatus, ProjectTabId } from "@/types/project";

export const PROJECT_TAB_IDS: ProjectTabId[] = [
  "overview",
  "all",
  "active",
  "completed",
  "delayed",
  "team",
  "timeline",
  "budget",
  "reports",
  "settings",
];

export const PROJECT_STATUSES: ProjectStatus[] = [
  "Planning",
  "Active",
  "On Hold",
  "In Review",
  "Completed",
  "Cancelled",
  "Delayed",
];

export const PROJECT_PRIORITIES: ProjectPriority[] = ["Low", "Medium", "High", "Urgent"];

export const PROJECT_TYPES = [
  "Website Development",
  "Branding",
  "Digital Marketing",
  "Social Media Management",
  "SEO / Content",
  "Video Production",
  "Consulting",
  "Automation",
  "Other",
] as const;

export const TAB_LABELS: Record<ProjectTabId, string> = {
  overview: "Overview",
  all: "All Projects",
  active: "Active Projects",
  completed: "Completed Projects",
  delayed: "Delayed Projects",
  team: "Team Allocation",
  timeline: "Project Timeline",
  budget: "Budget & Payments",
  reports: "Reports",
  settings: "Settings",
};
