import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";

const ROLES = new Set(["super_admin", "admin", "student", "freelancer", "mentor"]);
const STATUSES = new Set(["active", "inactive"]);

function friendlySupabaseError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("unable to verify")) {
    return "Server cannot reach Supabase (SSL/network). Restart npm run dev, or add SUPABASE_DEV_INSECURE_SSL=0 only if you fixed Windows certificates.";
  }
  if (lower.includes("already been registered") || lower.includes("already exists")) {
    return "This email is already registered in Supabase Auth. Use a different email or delete the old user in Authentication → Users.";
  }
  return message;
}

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
    const course = typeof record.course === "string" ? record.course.trim() : "";
    const assigned_mentor_id =
      typeof record.assigned_mentor_id === "string" ? record.assigned_mentor_id.trim() : "";
    const status =
      typeof record.status === "string" ? record.status.trim().toLowerCase() : "active";
    const password = typeof record.password === "string" ? record.password : "";

    if (!full_name || !emailRaw || !role || !department) {
      return NextResponse.json(
        { error: "full_name, email, role, and department are required." },
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

    let admin;
    try {
      admin = createAdminClient();
    } catch (configError) {
      const message =
        configError instanceof Error ? configError.message : "Supabase admin client not configured.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    let authData;
    let authError;
    try {
      const result = await admin.auth.admin.createUser({
        email: emailRaw,
        password,
        email_confirm: true,
        user_metadata: { full_name, role },
      });
      authData = result.data;
      authError = result.error;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "fetch failed";
      return NextResponse.json(
        { error: friendlySupabaseError(message) },
        { status: 503 },
      );
    }

    if (authError || !authData?.user) {
      const raw = authError?.message ?? "Could not create auth user.";
      return NextResponse.json(
        { error: friendlySupabaseError(raw) },
        { status: 400 },
      );
    }

    const userId = authData.user!.id;

    const profileCore = {
      id: userId,
      full_name,
      email: emailRaw,
      role,
    };

    const profileFull = {
      ...profileCore,
      department,
      course: course || null,
      assigned_mentor_id:
        role === "student" && assigned_mentor_id ? assigned_mentor_id : null,
      designation: null,
      status,
    };

    let profileError = (
      await admin.from("profiles").upsert(profileFull, { onConflict: "id" })
    ).error;

    if (
      profileError &&
      /column|schema cache/i.test(profileError.message ?? "")
    ) {
      profileError = (
        await admin.from("profiles").upsert(profileCore, { onConflict: "id" })
      ).error;
    }

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
        .upsert(profileCore, { onConflict: "id" });

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
      status,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unexpected server error while creating employee.";
    return NextResponse.json({ error: friendlySupabaseError(raw) }, { status: 500 });
  }
}
