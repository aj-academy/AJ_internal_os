type SecurityEventMeta = Record<string, string | number | boolean | null | undefined>;

/** Structured security events for server logs (auth, rate limits, privilege denials). */
export function logSecurityEvent(event: string, meta?: SecurityEventMeta) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...meta,
  };
  console.info("[security]", JSON.stringify(payload));
}
