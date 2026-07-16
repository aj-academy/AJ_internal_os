import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { FINANCE_SETTINGS_KEY, parseFinanceSettingsLists } from "@/lib/financeSettings";

/** Authenticated staff can read Finance dropdown lists. */
export async function GET() {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", FINANCE_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Could not load finance settings." },
        { status: 400 },
      );
    }

    return NextResponse.json({ lists: parseFinanceSettingsLists(data?.setting_value) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load finance settings.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
