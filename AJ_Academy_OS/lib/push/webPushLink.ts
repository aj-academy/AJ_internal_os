import "server-only";

import { safePushTargetUrl } from "@/lib/push/safeTargetUrl";

/** Absolute HTTPS origin for webpush fcmOptions.link (relative paths are rejected by FCM). */
export function getPublicAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "";
  if (!raw) return "https://aj-internal-os.vercel.app";
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    return u.origin;
  } catch {
    return "https://aj-internal-os.vercel.app";
  }
}

/** Build absolute click URL for FCM webpush; keeps only safe internal paths. */
export function absolutePushClickUrl(targetUrl: string): string {
  const path = safePushTargetUrl(targetUrl);
  return `${getPublicAppOrigin()}${path}`;
}

export function firebaseSendErrorInfo(e: unknown): { code: string; message: string } {
  if (e && typeof e === "object") {
    const err = e as {
      code?: string;
      message?: string;
      errorInfo?: { code?: string; message?: string };
    };
    const code = String(err.errorInfo?.code || err.code || "");
    const message = String(err.errorInfo?.message || err.message || "Send failed").slice(0, 240);
    return { code, message };
  }
  return { code: "", message: "Send failed" };
}
