import { getApps, getApp, initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readPublicConfig(): FirebasePublicConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ?? "";
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? "";

  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: storageBucket || `${projectId}.appspot.com`,
    messagingSenderId,
    appId,
  };
}

export function getFirebasePublicConfig(): FirebasePublicConfig | null {
  return readPublicConfig();
}

export function getFirebaseVapidKey(): string | null {
  const key = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() ?? "";
  return key || null;
}

let appSingleton: FirebaseApp | null = null;

/** Browser-only Firebase app (Messaging only — no Auth/Firestore/Storage). */
export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  const config = readPublicConfig();
  if (!config) return null;
  if (appSingleton) return appSingleton;
  appSingleton = getApps().length ? getApp() : initializeApp(config);
  return appSingleton;
}

export type MessagingSupportResult =
  | { ok: true; messaging: Messaging }
  | { ok: false; reason: "unsupported" | "unconfigured" | "server" };

/** Obtain Firebase Messaging only in supported browsers. Never call on the server. */
export async function getFirebaseMessaging(): Promise<MessagingSupportResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "server" };
  }
  const app = getFirebaseApp();
  if (!app) return { ok: false, reason: "unconfigured" };
  try {
    const supported = await isSupported();
    if (!supported) return { ok: false, reason: "unsupported" };
    return { ok: true, messaging: getMessaging(app) };
  } catch {
    return { ok: false, reason: "unsupported" };
  }
}
