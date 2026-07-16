import {
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
} from "@/components/project-master/projectConfig";
import { mergeSettings } from "@/components/settings/settingsDefaults";
import { createClient } from "@/lib/supabase/client";
import { linesToList, listToLines } from "@/lib/crmSettings";

export const PROJECT_SETTINGS_KEY = "project";

export type ProjectSettingsLists = {
  statuses: string[];
  priorities: string[];
  projectTypes: string[];
  defaultDeadlineDays: number;
};

function asStringList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : [...fallback];
}

export function defaultProjectSettingsLists(): ProjectSettingsLists {
  return {
    statuses: [...PROJECT_STATUSES],
    priorities: [...PROJECT_PRIORITIES],
    projectTypes: [...PROJECT_TYPES],
    defaultDeadlineDays: 30,
  };
}

export function parseProjectSettingsLists(value: unknown): ProjectSettingsLists {
  const merged = mergeSettings(PROJECT_SETTINGS_KEY, value);
  const defaults = defaultProjectSettingsLists();
  const days = Number(merged.defaultDeadlineDays);
  return {
    statuses: asStringList(merged.statuses, PROJECT_STATUSES),
    priorities: asStringList(merged.priorities, PROJECT_PRIORITIES),
    projectTypes: asStringList(merged.projectTypes, PROJECT_TYPES),
    defaultDeadlineDays: Number.isFinite(days) && days > 0 ? Math.round(days) : defaults.defaultDeadlineDays,
  };
}

export async function fetchProjectSettingsLists(
  _supabase?: ReturnType<typeof createClient>,
): Promise<ProjectSettingsLists> {
  try {
    const res = await fetch("/api/projects/lists", { credentials: "include" });
    const json = (await res.json()) as { lists?: ProjectSettingsLists; error?: string };
    if (res.ok && json.lists) return parseProjectSettingsLists(json.lists);
  } catch {
    /* fall through */
  }
  if (_supabase) {
    const { data, error } = await _supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", PROJECT_SETTINGS_KEY)
      .maybeSingle();
    if (!error) return parseProjectSettingsLists(data?.setting_value);
  }
  return defaultProjectSettingsLists();
}

export async function persistProjectSettingsLists(lists: ProjectSettingsLists): Promise<ProjectSettingsLists> {
  const getRes = await fetch(`/api/admin/settings?key=${PROJECT_SETTINGS_KEY}`, { credentials: "include" });
  const getJson = (await getRes.json()) as { setting?: { setting_value?: unknown } | null; error?: string };
  if (!getRes.ok) throw new Error(getJson.error ?? "Could not load project settings.");

  const base = mergeSettings(PROJECT_SETTINGS_KEY, getJson.setting?.setting_value);
  const nextValue = {
    ...base,
    statuses: lists.statuses,
    priorities: lists.priorities,
    projectTypes: lists.projectTypes,
    defaultDeadlineDays: lists.defaultDeadlineDays,
  };

  const putRes = await fetch("/api/admin/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setting_key: PROJECT_SETTINGS_KEY,
      setting_value: nextValue,
    }),
  });
  const putJson = (await putRes.json()) as { error?: string };
  if (!putRes.ok) throw new Error(putJson.error ?? "Could not save project settings.");
  return parseProjectSettingsLists(nextValue);
}

export { linesToList, listToLines };
