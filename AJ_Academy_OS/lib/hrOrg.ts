import { mergeSettings } from "@/components/settings/settingsDefaults";

export const HR_ORG_SETTING_KEY = "hr_org";

export type HrOrgSettings = {
  departments: string[];
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
};

/** Strips legacy jobDomainsByDepartment from stored JSON. */
export function mergeHrOrgSettings(value: unknown): HrOrgSettings {
  const merged = mergeSettings(HR_ORG_SETTING_KEY, value) as Partial<HrOrgSettings> & {
    jobDomainsByDepartment?: unknown;
  };
  if (Array.isArray(merged.departments)) {
    return {
      departments: merged.departments.map((d) => String(d).trim()).filter(Boolean),
    };
  }

  return { departments: [...HR_ORG_DEFAULTS.departments] };
}
