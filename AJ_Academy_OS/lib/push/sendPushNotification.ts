import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getFirebaseAdminMessaging, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { safePushTargetUrl } from "@/lib/push/safeTargetUrl";
import { firebaseSendErrorInfo } from "@/lib/push/webPushLink";


export type PushNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type: string;
  targetUrl: string;
  entityType?: string | null;
  entityId?: string | null;
  priority?: "low" | "normal" | "high";
  /** Reuse an existing in_app_notifications row when already inserted */
  existingNotificationId?: string | null;
  /** When true, skip inserting in_app_notifications (caller already did) */
  skipInAppInsert?: boolean;
};

export type PushSendResult = {
  notificationId: string | null;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Insert (or reuse) in-app notification + deliver FCM to active devices.
 * Never throws for push failures — business ops must already have succeeded.
 */
export async function sendPushNotification(input: PushNotificationInput): Promise<PushSendResult> {
  const result: PushSendResult = {
    notificationId: input.existingNotificationId ?? null,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (!isUuid(input.userId)) {
    result.errors.push("Invalid userId.");
    result.skipped = 1;
    return result;
  }

  const title = String(input.title || "").trim().slice(0, 120);
  const message = String(input.message || "").trim().slice(0, 240);
  const type = String(input.type || "general").trim().slice(0, 64) || "general";
  const targetUrl = safePushTargetUrl(input.targetUrl);
  const priority = input.priority === "high" || input.priority === "low" ? input.priority : "normal";

  if (!title || !message) {
    result.errors.push("title and message are required.");
    result.skipped = 1;
    return result;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "Admin client unavailable.");
    result.skipped = 1;
    return result;
  }

  // 1) In-app notification (source of truth)
  if (!input.skipInAppInsert && !result.notificationId) {
    const meta: Record<string, unknown> = { priority, push: true };
    if (input.entityType) meta.entity_type = input.entityType;
    if (input.entityId) meta.entity_id = input.entityId;

    const { data: inserted, error: insertError } = await admin
      .from("in_app_notifications")
      .insert({
        user_id: input.userId,
        type,
        title,
        body: message,
        link_path: targetUrl,
        meta,
        push_status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      // Column push_status may be missing before SQL patch — retry without it
      if (/push_status|column|schema cache/i.test(insertError.message)) {
        const fallback = await admin
          .from("in_app_notifications")
          .insert({
            user_id: input.userId,
            type,
            title,
            body: message,
            link_path: targetUrl,
            meta,
          })
          .select("id")
          .single();
        if (fallback.error) {
          result.errors.push(fallback.error.message);
          result.skipped = 1;
          return result;
        }
        result.notificationId = fallback.data?.id ?? null;
      } else {
        result.errors.push(insertError.message);
        result.skipped = 1;
        return result;
      }
    } else {
      result.notificationId = inserted?.id ?? null;
    }
  }

  // 2) Active FCM devices (including notifications_after_logout = true)
  const { data: devices, error: devicesError } = await admin
    .from("push_devices")
    .select("id,fcm_token")
    .eq("user_id", input.userId)
    .eq("is_active", true);

  if (devicesError) {
    if (/push_devices|does not exist|schema cache/i.test(devicesError.message)) {
      result.errors.push("Run AJ_Academy_SB/fcm_push_devices.sql in Supabase.");
      result.skipped = 1;
      return result;
    }
    result.errors.push(devicesError.message);
    result.skipped = 1;
    return result;
  }

  const tokens = (devices ?? [])
    .map((d) => ({ id: d.id as string, token: String(d.fcm_token || "").trim() }))
    .filter((d) => d.token.length > 20);

  if (!tokens.length) {
    result.skipped = 1;
    if (result.notificationId) {
      try {
        await admin
          .from("in_app_notifications")
          .update({ push_status: "skipped", last_push_error: "No active devices" })
          .eq("id", result.notificationId);
      } catch {
        // ignore delivery metadata failures
      }
    }
    return result;
  }

  if (!isFirebaseAdminConfigured()) {
    result.errors.push("Firebase Admin is not configured on the server.");
    result.skipped = tokens.length;
    return result;
  }

  let messaging;
  try {
    messaging = getFirebaseAdminMessaging();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "Firebase Admin init failed.");
    result.skipped = tokens.length;
    return result;
  }

  // Data-only payload → SW showNotification (no notification{} key = no browser auto-duplicate)
  const dataPayload: Record<string, string> = {
    title,
    body: message,
    targetUrl,
    url: targetUrl,
    type,
    notificationId: result.notificationId ?? "",
    source: "ajos-fcm",
  };

  result.attempted = tokens.length;

  for (const device of tokens) {
    try {
      await messaging.send({
        token: device.token,
        data: dataPayload,
        webpush: {
          headers: { Urgency: priority === "high" ? "high" : "normal" },
        },
      });
      result.succeeded += 1;
    } catch (e) {
      result.failed += 1;
      const { code, message: msg } = firebaseSendErrorInfo(e);
      // Never log the token
      result.errors.push(code ? `${code}: ${msg}` : msg);

      if (INVALID_TOKEN_CODES.has(code) || /not-registered|invalid-registration/i.test(msg)) {
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
  }

  if (result.notificationId) {
    const status =
      result.succeeded > 0 ? "sent" : result.failed > 0 ? "failed" : "skipped";
    try {
      await admin
        .from("in_app_notifications")
        .update({
          push_status: status,
          push_sent_at: result.succeeded > 0 ? new Date().toISOString() : null,
          push_success_count: result.succeeded,
          push_failure_count: result.failed,
          last_push_error: result.errors[0] ?? null,
        })
        .eq("id", result.notificationId);
    } catch {
      // ignore delivery metadata failures
    }
  }

  return result;
}
