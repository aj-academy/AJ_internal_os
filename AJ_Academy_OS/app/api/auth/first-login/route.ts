import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, enforceRateLimit } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/auditLog";
import { isValidEmail } from "@/lib/security/validate";

const ROLES = new Set(["super_admin", "admin", "employee", "student", "freelancer", "mentor"]);

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "auth:first-login", {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

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

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const emailLimited = checkRateLimit(`auth:first-login:email:${email}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!emailLimited.ok) {
    return NextResponse.json({ error: "Too many attempts for this email." }, { status: 429 });
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
    logSecurityEvent("first_login_failed", { email, reason: "profile_not_found" });
    return NextResponse.json({ error: "Could not initialize account." }, { status: 400 });
  }

  if ((profile.role ?? "").toLowerCase() !== role) {
    logSecurityEvent("first_login_failed", { email, reason: "role_mismatch" });
    return NextResponse.json({ error: "Could not initialize account." }, { status: 400 });
  }

  if ((profile.status ?? "active").toLowerCase() !== "active") {
    return NextResponse.json({ error: "Account is inactive." }, { status: 403 });
  }

  const { data: authLookup, error: authLookupError } = await admin.auth.admin.getUserById(profile.id);
  if (authLookupError || !authLookup.user) {
    return NextResponse.json({ error: "Could not initialize account." }, { status: 400 });
  }

  if (authLookup.user.last_sign_in_at) {
    return NextResponse.json({ error: "Password is already initialized for this account." }, { status: 409 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password,
    email_confirm: true,
  });

  if (updateError) {
    logSecurityEvent("first_login_failed", { email, reason: updateError.message });
    return NextResponse.json(
      { error: updateError.message ?? "Could not initialize password." },
      { status: 400 },
    );
  }

  await admin
    .from("profiles")
    .update({
      email,
      role,
      status: "active",
    })
    .eq("id", profile.id);

  logSecurityEvent("first_login_ok", { userId: profile.id, email });
  return NextResponse.json({ ok: true });
}
