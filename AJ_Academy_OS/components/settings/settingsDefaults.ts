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
    leadSources: ["Website", "Referral", "LinkedIn", "Cold Call", "Walk-in"],
    leadStatuses: ["Lead", "Contacted", "Converted", "Lost"],
    followUpTypes: ["Call", "Email", "Meeting", "WhatsApp"],
    serviceCategories: ["Branding", "Website", "Marketing", "Consulting"],
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
  project: {
    statuses: ["Planning", "Active", "On Hold", "In Review", "Completed", "Cancelled", "Delayed"],
    priorities: ["Low", "Medium", "High", "Urgent"],
    defaultDeadlineDays: 30,
    autoProgressFromTasks: true,
  },
  finance: {
    currency: "INR",
    taxPercent: 18,
    paymentMethods: ["Cash", "Bank Transfer", "UPI", "Credit Card", "Cheque"],
    invoicePrefix: "INV-",
    expenseCategoriesNote: "Also see finance_categories table",
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
    dateFormat: "YYYY-MM-DD",
    timeFormat: "24h",
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

export function mergeSettings(key: string, value: unknown): Record<string, unknown> {
  const raw = SETTINGS_DEFAULTS[key];
  const base = raw ? (JSON.parse(JSON.stringify(raw)) as Record<string, unknown>) : {};
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return { ...base, ...v };
}
