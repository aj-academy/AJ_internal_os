import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing required server env: ${name}`);
  }
  return value;
}

/**
 * Normalize Vercel / .env private key paste variants:
 * - wrapping quotes
 * - literal \n / \\n
 * - Windows CRLF
 */
export function normalizeFirebasePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  // Prefer double-escaped first, then single-escaped
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

let adminApp: App | null = null;
let adminInitError: string | null = null;

function getFirebaseAdminApp(): App {
  if (adminApp) return adminApp;
  if (adminInitError) {
    throw new Error(adminInitError);
  }

  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0]!;
    return adminApp;
  }

  try {
    const projectId = requireEnv("FIREBASE_PROJECT_ID");
    const clientEmail = requireEnv("FIREBASE_CLIENT_EMAIL");
    const privateKey = normalizeFirebasePrivateKey(requireEnv("FIREBASE_PRIVATE_KEY"));

    if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
      throw new Error(
        "FIREBASE_PRIVATE_KEY is malformed (missing BEGIN/END markers). Re-paste from the service-account JSON.",
      );
    }

    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
    return adminApp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Firebase Admin init failed";
    // Never include key material — keep message short/safe
    adminInitError = msg.includes("private") || msg.includes("PEM") || msg.includes("DECODER")
      ? "Firebase Admin private key could not be parsed. Re-set FIREBASE_PRIVATE_KEY on Vercel (full key with BEGIN/END, newlines as \\n)."
      : msg.slice(0, 240);
    throw new Error(adminInitError);
  }
}

/** Server-only FCM Admin messaging client. Never import from client components. */
export function getFirebaseAdminMessaging(): Messaging {
  return getMessaging(getFirebaseAdminApp());
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID?.trim() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      firebasePrivateKeyLooksValid(process.env.FIREBASE_PRIVATE_KEY),
  );
}

export function getFirebaseAdminInitError(): string | null {
  return adminInitError;
}
