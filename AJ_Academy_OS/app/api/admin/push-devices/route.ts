import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, requireStaffApiSession, trimString } from "@/lib/security";

export const runtime = "nodejs";

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "••••";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

/** Admin: list FCM devices (tokens masked). */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "admin:push-devices", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { response, profile } = await requireStaffApiSession();
  if (response) return response;
  const role = String(profile?.role || "").toLowerCase();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Admin client unavailable." }, { status: 500 });
  }

  const { data: devices, error } = await admin
    .from("push_devices")
    .select(
      "id,user_id,fcm_token,device_name,platform,browser,is_active,permission_status,notifications_after_logout,last_seen_at,created_at,disabled_at,disabled_reason",
    )
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      {
        error: /push_devices|does not exist/i.test(error.message)
          ? "Run AJ_Academy_SB/fcm_push_devices.sql in Supabase."
          : error.message,
      },
      { status: 400 },
    );
  }

  const userIds = [...new Set((devices ?? []).map((d) => d.user_id as string))];
  const nameMap: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      nameMap[p.id] = (p.full_name as string) || (p.email as string) || p.id.slice(0, 8);
    }
  }

  return NextResponse.json({
    devices: (devices ?? []).map((d) => ({
      id: d.id,
      userId: d.user_id,
      employeeName: nameMap[d.user_id as string] || "Unknown",
      deviceName: d.device_name,
      platform: d.platform,
      browser: d.browser,
      isActive: d.is_active,
      permissionStatus: d.permission_status,
      notificationsAfterLogout: d.notifications_after_logout,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
      disabledAt: d.disabled_at,
      disabledReason: d.disabled_reason,
      tokenHint: maskToken(String(d.fcm_token || "")),
    })),
  });
}

/** Admin: revoke / disable a device or send a test. */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "admin:push-devices:mutate", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { response, profile } = await requireStaffApiSession();
  if (response) return response;
  const role = String(profile?.role || "").toLowerCase();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: { deviceId?: string; action?: string };
  try {
    body = (await request.json()) as { deviceId?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const deviceId = trimString(body.deviceId, 64);
  const action = trimString(body.action, 32) || "revoke";
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required." }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Admin client unavailable." }, { status: 500 });
  }

  if (action === "revoke" || action === "disable") {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("push_devices")
      .update({
        is_active: false,
        notifications_after_logout: false,
        disabled_at: now,
        disabled_reason: action === "revoke" ? "admin_revoked" : "admin_disabled",
        permission_status: "revoked",
      })
      .eq("id", deviceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "test") {
    const { data: device } = await admin
      .from("push_devices")
      .select("user_id,is_active")
      .eq("id", deviceId)
      .maybeSingle();
    if (!device?.user_id || !device.is_active) {
      return NextResponse.json({ error: "Active device not found." }, { status: 404 });
    }
    const { sendPushNotification } = await import("@/lib/push/sendPushNotification");
    const result = await sendPushNotification({
      userId: device.user_id,
      title: "AJ OS Admin Test",
      message: "Open AJ OS to confirm push delivery on this device.",
      type: "admin_test",
      targetUrl: "/employee/notifications",
      priority: "normal",
    });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
