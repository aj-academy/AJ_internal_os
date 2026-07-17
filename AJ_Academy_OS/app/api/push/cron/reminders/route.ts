import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Future scheduled push reminders (Vercel Cron / external scheduler).
 * Not activated in vercel.json until reviewed.
 *
 * Protect with Authorization: Bearer $CRON_SECRET
 * Jobs must be idempotent (check meta / last push before re-sending).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured. Reminder cron is inactive." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    processed: 0,
    message:
      "Push reminder cron scaffold is ready. Wire task-due / visit / attendance queries after review; do not enable Vercel Cron until then.",
  });
}
