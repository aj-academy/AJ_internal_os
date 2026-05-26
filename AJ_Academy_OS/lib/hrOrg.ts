import { mergeSettings } from "@/components/settings/settingsDefaults";

export const HR_ORG_SETTING_KEY = "hr_org";

export type HrOrgSettings = {
  departments: string[];
  courses: string[];
};

export const HR_ORG_DEFAULTS: HrOrgSettings = {
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
};

/** Strips legacy jobDomainsByDepartment from stored JSON. */
export function mergeHrOrgSettings(value: unknown): HrOrgSettings {
  const merged = mergeSettings(HR_ORG_SETTING_KEY, value) as Partial<HrOrgSettings> & {
    jobDomainsByDepartment?: unknown;
  };
  const departments = Array.isArray(merged.departments)
    ? merged.departments.map((d) => String(d).trim()).filter(Boolean)
    : [...HR_ORG_DEFAULTS.departments];
  const courses = Array.isArray(merged.courses)
    ? merged.courses.map((c) => String(c).trim()).filter(Boolean)
    : [...HR_ORG_DEFAULTS.courses];

  return { departments, courses };
}
