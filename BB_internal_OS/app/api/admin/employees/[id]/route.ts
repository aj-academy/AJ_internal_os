import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";

const ROLES = new Set(["super_admin", "admin", "manager", "employee", "accounts"]);
const STATUSES = new Set(["active", "inactive"]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { response, user } = await requireAdminApiSession();
  if (response || !user) return response!;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing employee id." }, { status: 400 });
  }

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
    typeof record.status === "string" ? record.status.trim().toLowerCase() : "";

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

  const admin = createAdminClient();

  const { data: existing } = await admin.from("profiles").select("email").eq("id", id).maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const previousEmail =
    typeof existing.email === "string" ? existing.email.trim().toLowerCase() : "";

  if (emailRaw !== previousEmail) {
    const { error: authEmailError } = await admin.auth.admin.updateUserById(id, {
      email: emailRaw,
    });
    if (authEmailError) {
      return NextResponse.json(
        { error: authEmailError.message ?? "Could not update login email." },
        { status: 400 },
      );
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name,
      email: emailRaw,
      role,
      department,
      designation,
      status,
    })
    .eq("id", id);

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message ?? "Could not update profile." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    id,
    full_name,
    email: emailRaw,
    role,
    department,
    designation,
    status,
  });
}
