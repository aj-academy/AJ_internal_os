import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeApiSession } from "@/lib/auth/requireEmployeeApi";

export async function POST(request: Request) {
  const { response, user } = await requireEmployeeApiSession();
  if (response || !user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const ids =
    Array.isArray(record.policyIds) && record.policyIds.every((x) => typeof x === "string")
      ? (record.policyIds as string[])
      : null;

  if (!ids?.length) {
    return NextResponse.json({ error: "policyIds must be a non-empty string array." }, { status: 400 });
  }

  const admin = createAdminClient();

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
