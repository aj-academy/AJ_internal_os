import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeUserAccount } from "@/lib/admin/removeUserAccount";
import { requireAdminApiSession } from "@/lib/auth/requireAdminApi";
import type { UserRole } from "@/types/profile";

const ROLES = new Set(["super_admin", "admin", "student", "freelancer", "mentor"]);
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
  const course = typeof record.course === "string" ? record.course.trim() : "";
  const assigned_mentor_id =
    typeof record.assigned_mentor_id === "string" ? record.assigned_mentor_id.trim() : "";
  const status =
    typeof record.status === "string" ? record.status.trim().toLowerCase() : "";

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

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("email,role")
    .eq("id", id)
    .maybeSingle();

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

  const profileFull = {
    full_name,
    email: emailRaw,
    role,
    department,
    course: course || null,
    assigned_mentor_id: role === "student" && assigned_mentor_id ? assigned_mentor_id : null,
    designation: null,
    status,
  };

  let profileError = (await admin.from("profiles").update(profileFull).eq("id", id)).error;

  if (profileError && /column|schema cache/i.test(profileError.message ?? "")) {
    profileError = (
      await admin
        .from("profiles")
        .update({
          full_name,
          email: emailRaw,
          role,
          department,
          status,
        })
        .eq("id", id)
    ).error;
  }

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
    status,
  });
}

/** Permanently remove user: delete login + profile; keep task history with assignee name on file. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { response, user, profile: actor } = await requireAdminApiSession();
  if (response || !user) return response!;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target, error: loadError } = await admin
    .from("profiles")
    .select("id,full_name,email,role")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const targetRole = (target.role ?? "").trim().toLowerCase() as UserRole;
  const actorRole = (actor?.role ?? "").trim().toLowerCase() as UserRole;

  if (targetRole === "super_admin" && actorRole !== "super_admin") {
    return NextResponse.json(
      { error: "Only a super admin can remove another super admin." },
      { status: 403 },
    );
  }

  try {
    await removeUserAccount(
      admin,
      target.id,
      target.full_name ?? "User",
      target.email ?? "",
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Remove user failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "User removed. Login deleted; completed tasks keep their name on record.",
  });
}
