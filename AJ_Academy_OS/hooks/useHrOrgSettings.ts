"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HR_ORG_SETTING_KEY, mergeHrOrgSettings, type HrOrgSettings } from "@/lib/hrOrg";

function isMissingSettingsTable(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("system_settings") && (m.includes("does not exist") || m.includes("could not find"));
}

export function useHrOrgSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<HrOrgSettings>(() => mergeHrOrgSettings(null));
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", HR_ORG_SETTING_KEY)
      .maybeSingle();

    if (error) {
      if (isMissingSettingsTable(error.message)) {
        setSchemaMissing(true);
        setSettings(mergeHrOrgSettings(null));
      }
      setLoading(false);
      return;
    }

    setSchemaMissing(false);
    setSettings(mergeHrOrgSettings(data?.setting_value ?? null));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("hr-org-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, supabase]);

  return { settings, loading, schemaMissing, reload: load };
}
