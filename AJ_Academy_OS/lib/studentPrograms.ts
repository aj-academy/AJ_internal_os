import { INTERESTED_PROGRAMS } from "@/components/student-lead-master/studentMasterConfig";
import { mergeSettings } from "@/components/settings/settingsDefaults";
import { createClient } from "@/lib/supabase/client";

export const CRM_SETTINGS_KEY = "crm";

export function defaultInterestedPrograms(): string[] {
  return [...INTERESTED_PROGRAMS];
}

export function parseInterestedProgramsFromCrm(value: unknown): string[] {
  const merged = mergeSettings(CRM_SETTINGS_KEY, value);
  const raw = merged.interestedPrograms;
  if (!Array.isArray(raw)) return defaultInterestedPrograms();
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : defaultInterestedPrograms();
}

export function mergeProgramLists(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...existing, ...incoming]) {
    const t = name.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export async function fetchInterestedPrograms(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", CRM_SETTINGS_KEY)
    .maybeSingle();
  if (error) return defaultInterestedPrograms();
  return parseInterestedProgramsFromCrm(data?.setting_value);
}

export async function persistInterestedPrograms(programs: string[]): Promise<string[]> {
  const merged = mergeProgramLists(defaultInterestedPrograms(), programs);
  const getRes = await fetch("/api/admin/settings?key=crm");
  const getJson = (await getRes.json()) as { setting?: { setting_value?: unknown } | null; error?: string };
  if (!getRes.ok) throw new Error(getJson.error ?? "Could not load CRM settings.");

  const crmBase = mergeSettings(CRM_SETTINGS_KEY, getJson.setting?.setting_value);
  const putRes = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setting_key: CRM_SETTINGS_KEY,
      setting_value: { ...crmBase, interestedPrograms: merged },
    }),
  });
  const putJson = (await putRes.json()) as { error?: string };
  if (!putRes.ok) throw new Error(putJson.error ?? "Could not save program list.");
  return merged;
}
