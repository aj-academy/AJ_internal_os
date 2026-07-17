import { NextResponse } from "next/server";
import { firebasePrivateKeyLooksValid } from "@/lib/firebase/privateKey";

export const runtime = "nodejs";

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Safe Firebase / push health — never returns credentials. Never imports firebase-admin. */
export async function GET() {
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const serverProjectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? "";

  const firebaseClientConfigured = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
  ].every(present);

  const privateKeyFormatOk = firebasePrivateKeyLooksValid(process.env.FIREBASE_PRIVATE_KEY);
  const firebaseAdminConfigured =
    present("FIREBASE_PROJECT_ID") && present("FIREBASE_CLIENT_EMAIL") && privateKeyFormatOk;

  const projectIdsMatch =
    Boolean(clientProjectId) &&
    Boolean(serverProjectId) &&
    clientProjectId === serverProjectId;

  const databaseConfigured = present("NEXT_PUBLIC_SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY");

  const missingClient = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
  ].filter((k) => !present(k));

  const missingServer = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"].filter(
    (k) => !present(k),
  );

  return NextResponse.json({
    firebaseClientConfigured,
    firebaseAdminConfigured,
    projectIdsMatch,
    databaseConfigured,
    privateKeyFormatOk,
    vapidKeyPresent: present("NEXT_PUBLIC_FIREBASE_VAPID_KEY"),
    clientProjectId: clientProjectId || null,
    serverProjectId: serverProjectId || null,
    missingClientEnv: missingClient,
    missingServerEnv: missingServer,
    nodeEnv: process.env.NODE_ENV,
    showSystemNotificationInForeground:
      process.env.NEXT_PUBLIC_SHOW_SYSTEM_NOTIFICATION_IN_FOREGROUND !== "false",
  });
}
