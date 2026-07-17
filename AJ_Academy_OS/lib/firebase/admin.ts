import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import {
  firebasePrivateKeyLooksValid,
  normalizeFirebasePrivateKey,
} from "@/lib/firebase/privateKey";

export { firebasePrivateKeyLooksValid, normalizeFirebasePrivateKey } from "@/lib/firebase/privateKey";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing required server env: ${name}`);
  }
  return value;
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
    adminInitError =
      msg.includes("private") || msg.includes("PEM") || msg.includes("DECODER")
        ? "Firebase Admin private key could not be parsed. Re-set FIREBASE_PRIVATE_KEY on Vercel (full key with BEGIN/END, newlines as \\n)."
        : msg.slice(0, 240);
    throw new Error(adminInitError);
  }
}

/** Server-only FCM Admin messaging client. Never import from client components or middleware. */
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
