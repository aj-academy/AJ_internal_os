/** Default JSON shapes per `system_settings.setting_key` (merged with DB on load). */
export const SETTINGS_DEFAULTS: Record<string, Record<string, unknown>> = {
  company: {
    companyName: "",
    companyEmail: "",
    phoneNumber: "",
    address: "",
    gstNumber: "",
    website: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
    logoUrl: "",
  },
  attendance: {
    officeStartTime: "09:00",
    officeEndTime: "18:00",
    graceMinutes: 10,
    autoLateMark: true,
    workingDays: "Mon,Tue,Wed,Thu,Fri",
    overtimeRules: "As per policy",
    locationTracking: true,
  },
  crm: {
    leadSources: [
      "Meta Ads",
      "Google Ads",
      "Website",
      "WhatsApp",
      "Referral",
      "LinkedIn",
      "Instagram",
      "Cold Call",
      "Walk-in",
      "College Drive",
      "Seminar",
      "Other",
    ],
    leadStatuses: [
      "New",
      "Contacted",
      "Interested",
      "Follow-up",
      "Counselling Scheduled",
      "Fee Discussed",
      "Admitted",
      "Lost",
      "Not Interested",
    ],
    followUpTypes: ["Call", "WhatsApp", "Meeting", "Email"],
    serviceCategories: [
      "Full Stack Development",
      "Data Science",
      "Digital Marketing",
      "UI/UX Design",
      "Cloud / DevOps",
      "Business Analytics",
      "Other",
    ],
    priorityTypes: ["Hot", "Warm", "Cold"],
    interestedPrograms: [
      "Full Stack Development",
      "Data Science",
      "Digital Marketing",
      "UI/UX Design",
      "Cloud / DevOps",
      "Business Analytics",
      "Other",
    ],
    whatsAppTemplates: [
      "Hi {name}, this is from AJ Academy. Thank you for your interest in our programs!",
      "Following up on your course enquiry. When would be a good time to speak?",
      "Sharing program details as discussed. Please let us know if you have any questions.",
      "Reminder: please confirm your preferred batch timing so we can reserve your seat.",
    ],
    emailTemplates: [
      "Hi {name},\n\nThank you for your interest in AJ Academy. Sharing the program details for your review.",
      "Hi {name},\n\nFollowing up on your enquiry. Please let us know a convenient time for a quick call.",
      "Hi {name},\n\nAs discussed, here are the next steps for your admission process.",
      "Hi {name},\n\nJust a reminder to confirm your preferred batch timing.",
    ],
  },
  college_visits: {
    visitStatuses: [
      "Not Visited",
      "Scheduled",
      "Contacted",
      "Visited",
      "Revisit Required",
      "On Hold",
    ],
    mouStatuses: [
      "Not Signed",
      "In Discussion",
      "Draft Shared",
      "Partially Signed",
      "Signed",
      "Declined",
    ],
    proposalStatuses: [
      "Not Sent",
      "Drafted",
      "Sent",
      "Accepted",
      "Rejected",
      "Revision Needed",
    ],
    finalStatuses: [
      "Open",
      "In Progress",
      "Converted",
      "Lost",
      "On Hold",
      "Closed - Rejected",
    ],
  },
  project: {
    statuses: ["Planning", "Active", "On Hold", "In Review", "Completed", "Cancelled", "Delayed"],
    priorities: ["Low", "Medium", "High", "Urgent"],
    projectTypes: [
      "Website Development",
      "Branding",
      "Digital Marketing",
      "Social Media Management",
      "SEO / Content",
      "Video Production",
      "Consulting",
      "Automation",
      "Other",
    ],
    defaultDeadlineDays: 30,
    autoProgressFromTasks: true,
  },
  finance: {
    currency: "INR",
    taxPercent: 18,
    paymentMethods: ["Cash", "Bank Transfer", "UPI", "Credit Card", "Cheque"],
    invoicePrefix: "INV-",
  },
  notifications: {
    emailNotifications: true,
    attendanceAlerts: true,
    taskAlerts: true,
    paymentReminders: true,
    followUpReminders: true,
  },
  security: {
    minPasswordLength: 8,
    sessionTimeoutMinutes: 480,
    loginAttemptLimit: 5,
    twoFactorPlaceholder: false,
  },
  preferences: {
    theme: "light",
    sidebarCollapsed: false,
    dashboardDefaultView: "overview",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "12h",
  },
  hr_org: {
    departments: [
      "Engineering",
      "Digital Marketing",
      "Human Resources",
      "Finance",
      "Operations",
      "Sales",
    ],
    courses: [
      "Full Stack Development",
      "Digital Marketing",
      "Data Analytics",
      "UI/UX Design",
    ],
  },
};

export type SystemPreferences = {
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  dashboardDefaultView: "overview" | "tasks" | "attendance" | "crm";
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
  timeFormat: "12h" | "24h";
};

export const PREFERENCE_THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export const PREFERENCE_DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
] as const;

export const PREFERENCE_TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour (AM/PM)" },
  { value: "24h", label: "24-hour" },
] as const;

export const PREFERENCE_DASHBOARD_VIEW_OPTIONS = [
  { value: "overview", label: "Overview (home dashboard)" },
  { value: "tasks", label: "Tasks" },
  { value: "attendance", label: "Attendance" },
  { value: "crm", label: "Student Master / CRM" },
] as const;

export function mergeSettings(key: string, value: unknown): Record<string, unknown> {
  const raw = SETTINGS_DEFAULTS[key];
  const base = raw ? (JSON.parse(JSON.stringify(raw)) as Record<string, unknown>) : {};
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const merged = { ...base, ...v };
  // Drop legacy finance placeholder if present in older DB rows
  if (key === "finance" && "expenseCategoriesNote" in merged) {
    delete merged.expenseCategoriesNote;
  }
  return merged;
}

export function mergeSystemPreferences(value: unknown): SystemPreferences {
  const merged = mergeSettings("preferences", value);
  const theme = merged.theme === "dark" ? "dark" : "light";
  const dateFormat =
    merged.dateFormat === "YYYY-MM-DD" || merged.dateFormat === "MM/DD/YYYY" || merged.dateFormat === "DD/MM/YYYY"
      ? merged.dateFormat
      : "DD/MM/YYYY";
  const timeFormat = merged.timeFormat === "24h" ? "24h" : "12h";
  const dashboardDefaultView =
    merged.dashboardDefaultView === "tasks" ||
    merged.dashboardDefaultView === "attendance" ||
    merged.dashboardDefaultView === "crm"
      ? merged.dashboardDefaultView
      : "overview";
  return {
    theme,
    sidebarCollapsed: Boolean(merged.sidebarCollapsed),
    dashboardDefaultView,
    dateFormat,
    timeFormat,
  };
}

/** Normalize stored times to HH:mm for <input type="time">. */
export function normalizeTimeInputValue(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
