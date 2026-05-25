"use client";

import { useCallback, useEffect, useState } from "react";
import { HR_ORG_SETTING_KEY, mergeHrOrgSettings, type HrOrgSettings } from "@/lib/hrOrg";

export function useHrOrgSettings() {
  const [settings, setSettings] = useState<HrOrgSettings>(() => mergeHrOrgSettings(null));
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${HR_ORG_SETTING_KEY}`, {
        credentials: "include",
      });

      if (res.status === 401 || res.status === 403) {
        setSchemaMissing(false);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = payload.error ?? "";
        if (/does not exist|could not find|system_settings/i.test(msg)) {
          setSchemaMissing(true);
        }
        setLoading(false);
        return;
      }

      const payload = (await res.json()) as {
        setting?: { setting_value?: unknown } | null;
      };
      setSchemaMissing(false);
      setSettings(mergeHrOrgSettings(payload.setting?.setting_value ?? null));
    } catch {
      setSchemaMissing(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const applySettings = useCallback((value: HrOrgSettings) => {
    setSettings(value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    settings,
    loading,
    schemaMissing,
    reload: load,
    applySettings,
  };
}
