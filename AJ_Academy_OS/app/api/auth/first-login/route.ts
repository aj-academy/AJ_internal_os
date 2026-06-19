import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = new Set(["super_admin", "admin", "employee", "student", "freelancer", "mentor"]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const role = typeof record.role === "string" ? record.role.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";

  if (!email || !role || !password) {
    return NextResponse.json(
      { error: "email, role, and password are required." },
      { status: 400 },
    );
  }

  if (!ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role,status,email")
    .eq("email", email)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if ((profile.role ?? "").toLowerCase() !== role) {
    return NextResponse.json({ error: "Selected role does not match account role." }, { status: 403 });
  }

  if ((profile.status ?? "active").toLowerCase() !== "active") {
    return NextResponse.json({ error: "Account is inactive." }, { status: 403 });
  }

  const { data: authLookup, error: authLookupError } = await admin.auth.admin.getUserById(profile.id);
  if (authLookupError || !authLookup.user) {
    return NextResponse.json({ error: "Auth user not found for this profile." }, { status: 404 });
  }

  if (authLookup.user.last_sign_in_at) {
    return NextResponse.json({ error: "Password is already initialized for this account." }, { status: 409 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password,
    email_confirm: true,
  });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Could not initialize password." },
      { status: 400 },
    );
  }

  // Keep profile row normalized to match login identity used by the employee.
  await admin
    .from("profiles")
    .update({
      email,
      role,
      status: "active",
    })
    .eq("id", profile.id);

  return NextResponse.json({ ok: true });
}
