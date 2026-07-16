import {
  CRM_FOLLOW_UP_TYPES_UI,
  CRM_LEAD_STATUSES,
  CRM_PRIORITIES,
  CRM_SOURCES,
  INTERESTED_PROGRAMS,
} from "@/components/student-lead-master/studentMasterConfig";
import { mergeSettings } from "@/components/settings/settingsDefaults";
import { createClient } from "@/lib/supabase/client";

export const CRM_SETTINGS_KEY = "crm";

export type CrmSettingsLists = {
  leadSources: string[];
  leadStatuses: string[];
  followUpTypes: string[];
  priorityTypes: string[];
  interestedPrograms: string[];
  /** Legacy alias for programs / service interests shown in SM Settings */
  serviceCategories: string[];
};

function asStringList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : [...fallback];
}

export function defaultCrmSettingsLists(): CrmSettingsLists {
  return {
    leadSources: [...CRM_SOURCES],
    leadStatuses: [...CRM_LEAD_STATUSES],
    followUpTypes: [...CRM_FOLLOW_UP_TYPES_UI],
    priorityTypes: [...CRM_PRIORITIES],
    interestedPrograms: [...INTERESTED_PROGRAMS],
    serviceCategories: [...INTERESTED_PROGRAMS],
  };
}

export function parseCrmSettingsLists(value: unknown): CrmSettingsLists {
  const merged = mergeSettings(CRM_SETTINGS_KEY, value);
  const defaults = defaultCrmSettingsLists();
  const interestedPrograms = asStringList(merged.interestedPrograms, INTERESTED_PROGRAMS);
  // Prefer interestedPrograms; fall back to serviceCategories for older rows
  const serviceCategories = asStringList(
    merged.serviceCategories,
    interestedPrograms.length ? interestedPrograms : INTERESTED_PROGRAMS,
  );
  return {
    leadSources: asStringList(merged.leadSources, CRM_SOURCES),
    leadStatuses: asStringList(merged.leadStatuses, CRM_LEAD_STATUSES),
    followUpTypes: asStringList(merged.followUpTypes, CRM_FOLLOW_UP_TYPES_UI),
    priorityTypes: asStringList(merged.priorityTypes, CRM_PRIORITIES),
    interestedPrograms: interestedPrograms.length ? interestedPrograms : serviceCategories,
    serviceCategories,
  };
}

export async function fetchCrmSettingsLists(
  _supabase?: ReturnType<typeof createClient>,
): Promise<CrmSettingsLists> {
  try {
    const res = await fetch("/api/crm/lists", { credentials: "include" });
    const json = (await res.json()) as { lists?: CrmSettingsLists; error?: string };
    if (res.ok && json.lists) return parseCrmSettingsLists(json.lists);
  } catch {
    /* fall through */
  }
  // Fallback: direct table read (admin RLS) or defaults
  if (_supabase) {
    const { data, error } = await _supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", CRM_SETTINGS_KEY)
      .maybeSingle();
    if (!error) return parseCrmSettingsLists(data?.setting_value);
  }
  return defaultCrmSettingsLists();
}

export async function persistCrmSettingsLists(lists: CrmSettingsLists): Promise<CrmSettingsLists> {
  const getRes = await fetch(`/api/admin/settings?key=${CRM_SETTINGS_KEY}`, { credentials: "include" });
  const getJson = (await getRes.json()) as { setting?: { setting_value?: unknown } | null; error?: string };
  if (!getRes.ok) throw new Error(getJson.error ?? "Could not load CRM settings.");

  const crmBase = mergeSettings(CRM_SETTINGS_KEY, getJson.setting?.setting_value);
  const programs = lists.interestedPrograms.length ? lists.interestedPrograms : lists.serviceCategories;
  const nextValue = {
    ...crmBase,
    leadSources: lists.leadSources,
    leadStatuses: lists.leadStatuses,
    followUpTypes: lists.followUpTypes,
    priorityTypes: lists.priorityTypes,
    interestedPrograms: programs,
    serviceCategories: programs,
  };

  const putRes = await fetch("/api/admin/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setting_key: CRM_SETTINGS_KEY,
      setting_value: nextValue,
    }),
  });
  const putJson = (await putRes.json()) as { error?: string };
  if (!putRes.ok) throw new Error(putJson.error ?? "Could not save CRM settings.");
  return parseCrmSettingsLists(nextValue);
}

export function linesToList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function listToLines(items: string[]): string {
  return items.join("\n");
}
