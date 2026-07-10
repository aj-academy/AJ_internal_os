import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortalMemberApiSession } from "@/lib/auth/requirePortalMemberApi";
import { policyCategoryForRole } from "@/lib/security/policies";
import { isValidUuid } from "@/lib/security/validate";
import type { UserRole } from "@/types/profile";

export async function GET() {
  const { response, user, profile } = await requirePortalMemberApiSession(["employee", "student"]);
  if (response || !user || !profile) return response!;

  const category = policyCategoryForRole(profile.role as UserRole);
  if (!category) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: policies, error: policiesError } = await admin
    .from("company_policies")
    .select("id,name,policy_url,created_at,policy_category")
    .eq("policy_category", category)
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
