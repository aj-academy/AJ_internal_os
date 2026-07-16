import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { CRM_SETTINGS_KEY, parseCrmSettingsLists } from "@/lib/crmSettings";

/** Authenticated staff (admin + employee) can read CRM dropdown lists. */
export async function GET() {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", CRM_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message ?? "Could not load CRM settings." }, { status: 400 });
    }

    return NextResponse.json({ lists: parseCrmSettingsLists(data?.setting_value) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load CRM settings.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
