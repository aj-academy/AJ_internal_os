import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPayrollAutomation } from "@/lib/hr/payrollAutomation";

export const dynamic = "force-dynamic";

/**
 * Idempotent payroll automation processor.
 * Auth: Authorization: Bearer $CRON_SECRET  or  x-cron-secret: $CRON_SECRET
 * Schedule: vercel.json daily (after reminders cron).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") || "";
  if (!secret || (token !== secret && headerSecret !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Service role unavailable" },
      { status: 500 },
    );
  }

  const result = await processPayrollAutomation(admin, { actorId: null, limit: 50 });
  if (result.error && /Migration required/i.test(result.error)) {
    return NextResponse.json(result, { status: 503 });
  }
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return POST(request);
}
