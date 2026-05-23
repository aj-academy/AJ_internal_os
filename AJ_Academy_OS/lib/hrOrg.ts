import { mergeSettings } from "@/components/settings/settingsDefaults";

export const HR_ORG_SETTING_KEY = "hr_org";

export type HrOrgSettings = {
  departments: string[];
  jobDomainsByDepartment: Record<string, string[]>;
};

export const HR_ORG_DEFAULTS: HrOrgSettings = {
  departments: ["Engineering", "Human Resources", "Finance", "Operations", "Sales"],
  jobDomainsByDepartment: {
    Engineering: ["Engineering Manager", "Software Engineer", "Team Lead"],
    "Human Resources": ["HR Executive", "HR Manager"],
    Finance: ["Accounts Officer"],
    Operations: ["Admin Ops Lead"],
    Sales: ["Sales Executive", "Sales Manager"],
  },
};

export function mergeHrOrgSettings(value: unknown): HrOrgSettings {
  const merged = mergeSettings(HR_ORG_SETTING_KEY, value) as Partial<HrOrgSettings>;
  const departments =
    Array.isArray(merged.departments) && merged.departments.length
      ? merged.departments.map((d) => String(d).trim()).filter(Boolean)
      : [...HR_ORG_DEFAULTS.departments];

  const rawMap =
    merged.jobDomainsByDepartment && typeof merged.jobDomainsByDepartment === "object"
      ? (merged.jobDomainsByDepartment as Record<string, unknown>)
      : {};

  const jobDomainsByDepartment: Record<string, string[]> = {};
  departments.forEach((dept) => {
    const fromDb = rawMap[dept];
    const fallback = HR_ORG_DEFAULTS.jobDomainsByDepartment[dept] ?? ["General"];
    jobDomainsByDepartment[dept] =
      Array.isArray(fromDb) && fromDb.length
        ? fromDb.map((j) => String(j).trim()).filter(Boolean)
        : fallback;
  });

  return { departments, jobDomainsByDepartment };
}

export function jobDomainsForDepartment(settings: HrOrgSettings, department: string): string[] {
  const list = settings.jobDomainsByDepartment[department];
  if (list?.length) return list;
  return ["General"];
}
