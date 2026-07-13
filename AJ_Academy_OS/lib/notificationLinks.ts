/** Normalize notification deep-links so role dashboards open the right page. */
export function resolveNotificationHref(
  linkPath: string | null | undefined,
  fallbackHref: string,
): string {
  const fallback = (fallbackHref || "/").trim() || "/";
  const raw = (linkPath || "").trim();
  if (!raw) return fallback;

  // Legacy bug: employees were linked to /student/my-tasks (blocked by student layout).
  if (fallback.startsWith("/employee") && (raw === "/student/my-tasks" || raw.startsWith("/student/my-tasks?"))) {
    return raw.replace(/^\/student\/my-tasks/, "/employee/my-tasks");
  }

  // If fallback is employee and link points at wrong portal home, prefer My Tasks.
  if (fallback.startsWith("/employee") && (raw === "/student/dashboard" || raw === "/student")) {
    return "/employee/my-tasks";
  }

  return raw;
}
