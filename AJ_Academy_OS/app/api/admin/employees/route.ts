import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";

const ROLES = new Set(["super_admin", "admin", "student", "freelancer", "mentor"]);
const STATUSES = new Set(["active", "inactive"]);

export async function POST(request: Request) {
  try {
    const { response, user } = await requireAdminApiSession();
    if (response || !user) return response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const full_name = typeof record.full_name === "string" ? record.full_name.trim() : "";
    const emailRaw = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    const role = typeof record.role === "string" ? record.role.trim().toLowerCase() : "";
    const department =
      typeof record.department === "string" ? record.department.trim() : "";
    const designation =
      typeof record.designation === "string" ? record.designation.trim() : "";
    const status =
      typeof record.status === "string" ? record.status.trim().toLowerCase() : "active";
    const password = typeof record.password === "string" ? record.password : "";

    if (!full_name || !emailRaw || !role || !department || !designation) {
      return NextResponse.json(
        { error: "full_name, email, role, department, and designation are required." },
        { status: 400 },
      );
    }

    if (!ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters (employee's first sign-in)." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: emailRaw,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? "Could not create auth user." },
        { status: 400 },
      );
    }

    const userId = authData.user.id;

    const profilePayload = {
      id: userId,
      full_name,
      email: emailRaw,
      role,
      department,
      designation,
      status,
    };

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: profileError.message ?? "Could not save profile." },
        { status: 400 },
      );
    }

    // Safety check: ensure profile row is actually visible after write.
    const { data: savedProfile, error: readBackError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (readBackError || !savedProfile?.id) {
      const { error: retryError } = await admin
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (retryError) {
        await admin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: retryError.message ?? "Could not finalize employee profile sync." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      id: userId,
      full_name,
      email: emailRaw,
      role,
      department,
      designation,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error while creating employee.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
