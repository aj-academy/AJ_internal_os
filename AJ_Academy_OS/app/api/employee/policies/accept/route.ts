import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortalMemberApiSession } from "@/lib/auth/requirePortalMemberApi";
import { policyCategoryForRole } from "@/lib/security/policies";
import { isValidUuid, stringArray } from "@/lib/security/validate";
import type { UserRole } from "@/types/profile";

export async function POST(request: Request) {
  const { response, user, profile } = await requirePortalMemberApiSession(["employee", "student"]);
  if (response || !user || !profile) return response!;

  const category = policyCategoryForRole(profile.role as UserRole);
  if (!category) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const ids = stringArray(record.policyIds);
  if (!ids?.length) {
    return NextResponse.json({ error: "policyIds must be a non-empty string array." }, { status: 400 });
  }

  if (!ids.every((id) => isValidUuid(id))) {
    return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: allowedPolicies, error: policyError } = await admin
    .from("company_policies")
    .select("id")
    .eq("policy_category", category)
    .in("id", ids);

  if (policyError) {
    return NextResponse.json(
      { error: policyError.message ?? "Could not verify policies." },
      { status: 400 },
    );
  }

  const allowedIds = new Set((allowedPolicies ?? []).map((row) => row.id));
  if (allowedIds.size !== ids.length) {
    return NextResponse.json(
      { error: "One or more policies are not applicable to your account." },
      { status: 403 },
    );
  }

  for (const policy_id of ids) {
    const { error } = await admin.from("policy_acceptances").upsert(
      { profile_id: user.id, policy_id },
      { onConflict: "profile_id,policy_id" },
    );
    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Could not save acceptance." },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
