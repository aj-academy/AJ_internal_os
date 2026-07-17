import { NextResponse } from "next/server";
import { getApps } from "firebase-admin/app";
import { enforceRateLimit, requireStaffApiSession } from "@/lib/security";
import {
  getFirebaseAdminMessaging,
  isFirebaseAdminConfigured,
  firebasePrivateKeyLooksValid,
} from "@/lib/firebase/admin";
import { firebaseSendErrorInfo } from "@/lib/push/webPushLink";

export const runtime = "nodejs";

/**
 * Probe Firebase Admin credentials (no push to a real device).
 * Confirms the service account can obtain a Google access token.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push:admin-probe", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Firebase Admin env incomplete or private key format invalid.",
      privateKeyFormatOk: firebasePrivateKeyLooksValid(process.env.FIREBASE_PRIVATE_KEY),
    });
  }

  try {
    getFirebaseAdminMessaging();
    const app = getApps()[0];
    const credential = app?.options?.credential;
    if (!credential || typeof credential.getAccessToken !== "function") {
      return NextResponse.json({
        ok: false,
        error: "Firebase Admin app has no credential.getAccessToken().",
      });
    }
    const tokenResult = await credential.getAccessToken();
    const hasToken = Boolean(tokenResult?.access_token);
    return NextResponse.json({
      ok: hasToken,
      credentialOk: hasToken,
      projectId: process.env.FIREBASE_PROJECT_ID?.trim() || null,
      clientEmailSet: Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim()),
      privateKeyFormatOk: true,
      message: hasToken
        ? "Firebase Admin credential is valid (Google access token obtained)."
        : "Credential returned empty access token.",
    });
  } catch (e) {
    const { code, message } = firebaseSendErrorInfo(e);
    return NextResponse.json({
      ok: false,
      error: code ? `${code}: ${message}` : message,
      privateKeyFormatOk: firebasePrivateKeyLooksValid(process.env.FIREBASE_PRIVATE_KEY),
    });
  }
}
