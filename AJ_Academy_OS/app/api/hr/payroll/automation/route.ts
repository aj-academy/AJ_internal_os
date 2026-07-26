import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPayrollAutomation } from "@/lib/hr/payrollAutomation";

export const dynamic = "force-dynamic";

// GET — list recent automation jobs
export async function GET() {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payroll_automation_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        jobs: [],
        migrationRequired: "hr_payroll_14_automation.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}

// POST — manually run automation processor (admin)
export async function POST() {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  const admin = createAdminClient();
  const result = await processPayrollAutomation(admin, { actorId: profile.id, limit: 50 });
  if (result.error && /Migration required/i.test(result.error)) {
    return NextResponse.json(result, { status: 503 });
  }
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
