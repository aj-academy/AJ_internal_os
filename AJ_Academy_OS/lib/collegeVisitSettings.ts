import {
  CV_PROPOSAL_STATUSES,
  FINAL_STATUSES,
  MOU_STATUSES,
  VISIT_STATUSES,
} from "@/components/college-visits/collegeVisitsConfig";
import { mergeSettings } from "@/components/settings/settingsDefaults";
import { createClient } from "@/lib/supabase/client";
import { linesToList, listToLines } from "@/lib/crmSettings";

export const COLLEGE_VISITS_SETTINGS_KEY = "college_visits";

export type CollegeVisitSettingsLists = {
  visitStatuses: string[];
  mouStatuses: string[];
  proposalStatuses: string[];
  finalStatuses: string[];
};

function asStringList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : [...fallback];
}

export function defaultCollegeVisitSettingsLists(): CollegeVisitSettingsLists {
  return {
    visitStatuses: [...VISIT_STATUSES],
    mouStatuses: [...MOU_STATUSES],
    proposalStatuses: [...CV_PROPOSAL_STATUSES],
    finalStatuses: [...FINAL_STATUSES],
  };
}

export function parseCollegeVisitSettingsLists(value: unknown): CollegeVisitSettingsLists {
  const merged = mergeSettings(COLLEGE_VISITS_SETTINGS_KEY, value);
  return {
    visitStatuses: asStringList(merged.visitStatuses, VISIT_STATUSES),
    mouStatuses: asStringList(merged.mouStatuses, MOU_STATUSES),
    proposalStatuses: asStringList(merged.proposalStatuses, CV_PROPOSAL_STATUSES),
    finalStatuses: asStringList(merged.finalStatuses, FINAL_STATUSES),
  };
}

export async function fetchCollegeVisitSettingsLists(
  _supabase?: ReturnType<typeof createClient>,
): Promise<CollegeVisitSettingsLists> {
  try {
    const res = await fetch("/api/college-visits/lists", { credentials: "include" });
    const json = (await res.json()) as { lists?: CollegeVisitSettingsLists; error?: string };
    if (res.ok && json.lists) return parseCollegeVisitSettingsLists(json.lists);
  } catch {
    /* fall through */
  }
  if (_supabase) {
    const { data, error } = await _supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", COLLEGE_VISITS_SETTINGS_KEY)
      .maybeSingle();
    if (!error) return parseCollegeVisitSettingsLists(data?.setting_value);
  }
  return defaultCollegeVisitSettingsLists();
}

export async function persistCollegeVisitSettingsLists(
  lists: CollegeVisitSettingsLists,
): Promise<CollegeVisitSettingsLists> {
  const getRes = await fetch(`/api/admin/settings?key=${COLLEGE_VISITS_SETTINGS_KEY}`, {
    credentials: "include",
  });
  const getJson = (await getRes.json()) as { setting?: { setting_value?: unknown } | null; error?: string };
  if (!getRes.ok) throw new Error(getJson.error ?? "Could not load College Visits settings.");

  const base = mergeSettings(COLLEGE_VISITS_SETTINGS_KEY, getJson.setting?.setting_value);
  const nextValue = {
    ...base,
    visitStatuses: lists.visitStatuses,
    mouStatuses: lists.mouStatuses,
    proposalStatuses: lists.proposalStatuses,
    finalStatuses: lists.finalStatuses,
  };

  const putRes = await fetch("/api/admin/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setting_key: COLLEGE_VISITS_SETTINGS_KEY,
      setting_value: nextValue,
    }),
  });
  const putJson = (await putRes.json()) as { error?: string };
  if (!putRes.ok) throw new Error(putJson.error ?? "Could not save College Visits settings.");
  return parseCollegeVisitSettingsLists(nextValue);
}

export { linesToList, listToLines };
