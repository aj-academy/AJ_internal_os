"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { dashboardHrefForPreference, useSystemPreferences } from "@/hooks/useSystemPreferences";

/**
 * On home dashboard mount, navigate once to the preferred default module
 * (tasks / attendance / CRM) when set in System Preferences.
 */
export function DashboardDefaultViewRedirect({ role }: { role: "admin" | "employee" }) {
  const router = useRouter();
  const { preferences, loading } = useSystemPreferences();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (loading || didRedirect.current) return;
    const href = dashboardHrefForPreference(preferences.dashboardDefaultView, role);
    if (!href) return;
    didRedirect.current = true;
    router.replace(href);
  }, [loading, preferences.dashboardDefaultView, role, router]);

  return null;
}
