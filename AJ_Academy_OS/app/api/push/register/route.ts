import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, requireStaffApiSession, trimString } from "@/lib/security";

export const runtime = "nodejs";

type Body = {
  fcmToken?: string;
  deviceName?: string;
  platform?: string;
  browser?: string;
  userAgent?: string;
  notificationsAfterLogout?: boolean;
};

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push:register", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fcmToken = trimString(body.fcmToken, 4096);
  if (!fcmToken || fcmToken.length < 20) {
    return NextResponse.json({ error: "Valid fcmToken is required." }, { status: 400 });
  }

  const deviceName = trimString(body.deviceName, 120) || null;
  const platform = trimString(body.platform, 80) || null;
  const browser = trimString(body.browser, 80) || null;
  const userAgent =
    trimString(body.userAgent, 500) ||
    trimString(request.headers.get("user-agent"), 500) ||
    null;
  const notificationsAfterLogout = body.notificationsAfterLogout !== false;
  const now = new Date().toISOString();

  const row = {
    user_id: user.id,
    fcm_token: fcmToken,
    device_name: deviceName,
    platform,
    browser,
    user_agent: userAgent,
    is_active: true,
    permission_status: "granted",
    notifications_after_logout: notificationsAfterLogout,
    last_seen_at: now,
    disabled_at: null as string | null,
    disabled_reason: null as string | null,
    updated_at: now,
  };

  // Prefer service role for upsert reliability; fall back to user client
  let writer = await createClient();
  try {
    writer = createAdminClient();
  } catch {
    /* user client */
  }

  const { data, error } = await writer
    .from("push_devices")
    .upsert(row, { onConflict: "fcm_token" })
    .select("id,is_active,notifications_after_logout,last_seen_at,permission_status")
    .single();

  if (error) {
    const msg = error.message || "Could not register device.";
    return NextResponse.json(
      {
        error: /push_devices|does not exist|schema cache/i.test(msg)
          ? "Run AJ_Academy_SB/fcm_push_devices.sql in Supabase SQL Editor, then try again."
          : msg,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    device: {
      id: data.id,
      isActive: data.is_active,
      notificationsAfterLogout: data.notifications_after_logout,
      lastSeenAt: data.last_seen_at,
      permissionStatus: data.permission_status,
    },
  });
}
