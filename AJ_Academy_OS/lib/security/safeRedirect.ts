/** Allow only same-origin relative paths — blocks open redirects (e.g. //evil.com). */
export function safeRelativePath(nextParam: string | null | undefined, fallback = "/"): string {
  const trimmed = (nextParam ?? "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (!/^\/[a-zA-Z0-9/_\-.?=&%#]*$/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
