import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeApiSession } from "@/lib/auth/requireEmployeeApi";

export async function GET() {
  const { response, user } = await requireEmployeeApiSession();
  if (response || !user) return response!;

  const admin = createAdminClient();

  const { data: policies, error: policiesError } = await admin
    .from("company_policies")
    .select("id,name,policy_url,created_at")
    .order("created_at", { ascending: false });

  if (policiesError) {
    return NextResponse.json(
      { error: policiesError.message ?? "Could not load policies." },
      { status: 400 },
    );
  }

  const { data: acceptances, error: accError } = await admin
    .from("policy_acceptances")
    .select("policy_id")
    .eq("profile_id", user.id);

  if (accError) {
    return NextResponse.json(
      { error: accError.message ?? "Could not load acceptances." },
      { status: 400 },
    );
  }

  const accepted = new Set((acceptances ?? []).map((row) => row.policy_id));
  const all = policies ?? [];
  const pending = all.filter((p) => !accepted.has(p.id));

  return NextResponse.json({
    policies: all,
    pendingPolicies: pending,
    needsAcceptance: pending.length > 0,
  });
}
