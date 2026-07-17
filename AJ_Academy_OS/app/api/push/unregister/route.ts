import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, requireStaffApiSession, trimString } from "@/lib/security";

export const runtime = "nodejs";

type Body = {
  fcmToken?: string;
  deviceId?: string;
  reason?: string;
};

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push:unregister", { limit: 30, windowMs: 60_000 });
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
  const deviceId = trimString(body.deviceId, 64);
  const reason = trimString(body.reason, 120) || "user_disabled";

  if (!fcmToken && !deviceId) {
    return NextResponse.json({ error: "fcmToken or deviceId is required." }, { status: 400 });
  }

  let writer = await createClient();
  try {
    writer = createAdminClient();
  } catch {
    /* user client */
  }

  let q = writer
    .from("push_devices")
    .update({
      is_active: false,
      notifications_after_logout: false,
      disabled_at: new Date().toISOString(),
      disabled_reason: reason,
      permission_status: "disabled",
    })
    .eq("user_id", user.id);

  if (deviceId) q = q.eq("id", deviceId);
  else q = q.eq("fcm_token", fcmToken);

  const { data, error } = await q.select("id");
  if (error) {
    return NextResponse.json(
      {
        error: /push_devices|does not exist|schema cache/i.test(error.message)
          ? "Run AJ_Academy_SB/fcm_push_devices.sql in Supabase."
          : error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, disabled: data?.length ?? 0 });
}
