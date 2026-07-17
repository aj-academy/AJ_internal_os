/**
 * Firebase private-key string helpers — safe for Node API routes.
 * Do NOT import firebase-admin here (keeps middleware / light routes free of Admin SDK).
 */

export function normalizeFirebasePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (key.includes("\\\\n")) {
    key = key.replace(/\\\\n/g, "\n");
  }
  key = key.replace(/\\n/g, "\n");
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return key;
}

export function firebasePrivateKeyLooksValid(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const normalized = normalizeFirebasePrivateKey(raw);
  if (!normalized.includes("BEGIN PRIVATE KEY")) return false;
  if (!normalized.includes("END PRIVATE KEY")) return false;
  if (/^nMII/.test(normalized.replace(/^-----BEGIN PRIVATE KEY-----\s*/, ""))) return false;
  return true;
}
