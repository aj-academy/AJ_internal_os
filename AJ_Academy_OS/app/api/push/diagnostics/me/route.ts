import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, requireStaffApiSession } from "@/lib/security";

export const runtime = "nodejs";

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "••••";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

/** Current user's push_devices rows (tokens masked) + aggregate counts. */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "push:diagnostics-me", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    admin = await createClient();
  }

  const { data: devices, error } = await admin
    .from("push_devices")
    .select(
      "id,device_name,platform,browser,is_active,permission_status,notifications_after_logout,last_seen_at,created_at,disabled_at,disabled_reason,fcm_token,updated_at",
    )
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: /push_devices|does not exist/i.test(error.message)
          ? "Run AJ_Academy_SB/fcm_push_devices.sql in Supabase."
          : error.message,
        devices: [],
        activeCount: 0,
        inactiveCount: 0,
      },
      { status: 400 },
    );
  }

  const rows = devices ?? [];
  const activeCount = rows.filter((d) => d.is_active).length;
  const inactiveCount = rows.length - activeCount;

  return NextResponse.json({
    ok: true,
    userIdHint: `${user.id.slice(0, 8)}…`,
    activeCount,
    inactiveCount,
    devices: rows.map((d) => ({
      id: d.id,
      deviceName: d.device_name,
      platform: d.platform,
      browser: d.browser,
      isActive: d.is_active,
      permissionStatus: d.permission_status,
      notificationsAfterLogout: d.notifications_after_logout,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      disabledAt: d.disabled_at,
      disabledReason: d.disabled_reason,
      tokenHint: maskToken(String(d.fcm_token || "")),
    })),
  });
}
