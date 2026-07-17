import { safeRelativePath } from "@/lib/security/safeRedirect";

const DEFAULT_EMPLOYEE_TARGET = "/employee/dashboard";

/** Validate push/notification target URLs — internal paths only. */
export function safePushTargetUrl(
  raw: string | null | undefined,
  fallback: string = DEFAULT_EMPLOYEE_TARGET,
): string {
  const candidate = (raw ?? "").trim();
  if (!candidate) return fallback;
  // Disallow schemes and protocol-relative URLs before safeRelativePath
  const lower = candidate.toLowerCase();
  if (
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.includes("\\")
  ) {
    return fallback;
  }
  return safeRelativePath(candidate, fallback);
}

export function buildLoginRedirectHref(targetPath: string): string {
  const safe = safePushTargetUrl(targetPath, DEFAULT_EMPLOYEE_TARGET);
  return `/login?redirect=${encodeURIComponent(safe)}`;
}
