import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, requireStaffApiSession, trimString } from "@/lib/security";
import { getFirebaseAdminMessaging, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { firebaseSendErrorInfo } from "@/lib/push/webPushLink";

export const runtime = "nodejs";

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "••••";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

/**
 * Admin/staff diagnostic send to the caller's own active devices.
 * Returns Firebase error codes without exposing tokens.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push:debug-send", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: { deviceId?: string; allDevices?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Firebase Admin is not configured (check FIREBASE_* env on this deployment).",
      },
      { status: 503 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    admin = await createClient();
  }

  let query = admin
    .from("push_devices")
    .select("id,fcm_token,is_active,device_name,last_seen_at")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const deviceId = trimString(body.deviceId, 64);
  if (deviceId) {
    query = query.eq("id", deviceId);
  }

  const { data: devices, error } = await query.limit(body.allDevices === false && !deviceId ? 1 : 20);
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: /push_devices|does not exist/i.test(error.message)
          ? "Run AJ_Academy_SB/fcm_push_devices.sql in Supabase."
          : error.message,
      },
      { status: 400 },
    );
  }

  if (!devices?.length) {
    return NextResponse.json({
      ok: false,
      error: "No active push_devices for this user. Enable notifications first.",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    });
  }

  let messaging;
  try {
    messaging = getFirebaseAdminMessaging();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Firebase Admin init failed.",
        attempted: devices.length,
        succeeded: 0,
        failed: 0,
        results: [],
      },
      { status: 500 },
    );
  }

  const dataPayload = {
    title: "AJ OS Debug Push",
    body: "Open AJ OS — debug delivery test.",
    targetUrl: "/employee/notifications",
    url: "/employee/notifications",
    type: "debug_push",
    notificationId: `debug-${Date.now()}`,
    source: "ajos-fcm",
  };

  const results: Array<{
    deviceId: string;
    tokenHint: string;
    deviceName: string | null;
    ok: boolean;
    messageId?: string;
    errorCode?: string;
    errorMessage?: string;
  }> = [];

  let succeeded = 0;
  let failed = 0;

  for (const device of devices) {
    const token = String(device.fcm_token || "").trim();
    const entry = {
      deviceId: device.id as string,
      tokenHint: maskToken(token),
      deviceName: (device.device_name as string) || null,
      ok: false,
      messageId: undefined as string | undefined,
      errorCode: undefined as string | undefined,
      errorMessage: undefined as string | undefined,
    };
    try {
      const messageId = await messaging.send({
        token,
        data: dataPayload,
        webpush: {
          headers: { Urgency: "high" },
        },
      });
      entry.ok = true;
      entry.messageId = messageId;
      succeeded += 1;
    } catch (e) {
      failed += 1;
      const { code, message: msg } = firebaseSendErrorInfo(e);
      entry.errorCode = code || undefined;
      entry.errorMessage = msg;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        /not-registered|invalid-registration/i.test(msg)
      ) {
        await admin
          .from("push_devices")
          .update({
            is_active: false,
            disabled_at: new Date().toISOString(),
            disabled_reason: code || "invalid_token",
            permission_status: "unregistered",
          })
          .eq("id", device.id);
      }
    }
    results.push(entry);
  }

  void profile;
  return NextResponse.json({
    ok: succeeded > 0,
    attempted: devices.length,
    succeeded,
    failed,
    results,
  });
}
