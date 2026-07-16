"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  mergeSystemPreferences,
  type SystemPreferences,
} from "@/components/settings/settingsDefaults";
import { setDisplayPreferences } from "@/lib/datetime";

/**
 * Loads system_settings.preferences for the current user (admin write / employee read).
 * Also syncs date/time format into datetime display helpers.
 */
export function useSystemPreferences() {
  const [preferences, setPreferences] = useState<SystemPreferences>(() => mergeSystemPreferences(null));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "preferences")
        .maybeSingle();

      if (error) {
        const prefs = mergeSystemPreferences(null);
        setPreferences(prefs);
        setDisplayPreferences({ dateFormat: prefs.dateFormat, timeFormat: prefs.timeFormat });
        return;
      }

      const prefs = mergeSystemPreferences(data?.setting_value ?? null);
      setPreferences(prefs);
      setDisplayPreferences({ dateFormat: prefs.dateFormat, timeFormat: prefs.timeFormat });
    } catch {
      const prefs = mergeSystemPreferences(null);
      setPreferences(prefs);
      setDisplayPreferences({ dateFormat: prefs.dateFormat, timeFormat: prefs.timeFormat });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { preferences, loading, reload: load };
}

export function dashboardHrefForPreference(
  view: SystemPreferences["dashboardDefaultView"],
  role: "admin" | "employee",
): string | null {
  if (view === "overview") return null;
  if (role === "admin") {
    if (view === "tasks") return "/admin/task-assignment";
    if (view === "attendance") return "/admin/attendance";
    if (view === "crm") return "/admin/student-master";
  } else {
    if (view === "tasks") return "/employee/my-tasks";
    if (view === "attendance") return "/employee/attendance";
    if (view === "crm") return "/employee/student-master";
  }
  return null;
}
