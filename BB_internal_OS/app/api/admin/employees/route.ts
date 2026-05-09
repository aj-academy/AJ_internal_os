import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";

const ROLES = new Set(["super_admin", "admin", "manager", "employee", "accounts"]);
const STATUSES = new Set(["active", "inactive"]);

export async function POST(request: Request) {
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

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name,
    email: emailRaw,
    role,
    department,
    designation,
    status,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: profileError.message ?? "Could not save profile." },
      { status: 400 },
    );
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
}
