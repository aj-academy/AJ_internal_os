"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getRoleRedirectPath } from "@/lib/auth/roleRedirect";
import type { Profile, UserRole } from "@/types/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface LoginFormProps {
  initialError?: string;
  resetSuccess?: boolean;
  initialEmail?: string;
}

type LoginRoleOption = "admin" | "student" | "freelancer" | "mentor";

async function accountNeedsFirstLogin(email: string): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/needs-first-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { needsFirstLogin?: boolean };
    return Boolean(payload.needsFirstLogin);
  } catch {
    return false;
  }
}

const ERROR_MAP: Record<string, string> = {
  missing_role: "Role not assigned. Please contact admin.",
  inactive: "Your account is inactive. Please contact admin.",
  reset_link_invalid: "Reset link is invalid or expired. Please request a new one.",
};

async function parseApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

type FirstLoginResult =
  | { ok: true }
  | { ok: false; alreadyInitialized: true }
  | { ok: false; alreadyInitialized: false; error: string };

async function initializeFirstLogin(payload: { email: string; role: string; password: string }): Promise<FirstLoginResult> {
  const endpoints = ["/api/auth/first-login"];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 404) continue;
    if (response.ok) return { ok: true };
    if (response.status === 409) return { ok: false, alreadyInitialized: true };

    return {
      ok: false,
      alreadyInitialized: false,
      error: await parseApiError(response, "Could not initialize first login."),
    };
  }

  return { ok: false, alreadyInitialized: true };
}

export function LoginForm({ initialError, resetSuccess = false, initialEmail = "" }: LoginFormProps) {
  const [selectedRole, setSelectedRole] = useState<LoginRoleOption>("admin");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    initialError ? ERROR_MAP[initialError] ?? "Unable to login." : "",
  );
  const [resetNotice, setResetNotice] = useState(
    resetSuccess ? "Password updated successfully. Sign in with your new password below." : "",
  );
  const [isLoading, setIsLoading] = useState(false);

  const validRoles = new Set<UserRole>([
    "super_admin",
    "admin",
    "student",
    "freelancer",
    "mentor",
  ]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    let supabase;
    try {
      supabase = createClient();
    } catch (configError) {
      setError(configError instanceof Error ? configError.message : "Supabase is not configured.");
      setIsLoading(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    let firstLoginError: string | null = null;

    if (signInError || !signInData.user) {
      const tryFirstLogin = !resetSuccess && (await accountNeedsFirstLogin(normalizedEmail));

      if (tryFirstLogin) {
        const firstLoginResult = await initializeFirstLogin({
          email: normalizedEmail,
          role: selectedRole,
          password,
        });

        if (firstLoginResult.ok) {
          const retry = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          signInData = retry.data;
          signInError = retry.error;
        } else if (!firstLoginResult.alreadyInitialized) {
          firstLoginError = firstLoginResult.error;
        }
      }
    }

    if (signInError || !signInData.user) {
      const authMessage = signInError?.message ?? "";
      const friendlyAuthError =
        authMessage.toLowerCase().includes("invalid login credentials") ||
        authMessage.toLowerCase().includes("invalid email or password")
          ? "Incorrect email or password. Use Forgot password or contact your admin."
          : authMessage || "Invalid credentials.";
      setError(firstLoginError ?? friendlyAuthError);
      setIsLoading(false);
      return;
    }

    const authenticatedUserId = signInData.user.id;
    const authenticatedEmail = normalizedEmail;

    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authenticatedUserId)
      .maybeSingle<Profile>();

    if (profileError && !profile) {
      await supabase.auth.signOut();
      setError(`Could not load your profile (${profileError.message}). Contact admin.`);
      setIsLoading(false);
      return;
    }

    if (!profile) {
      const fallback = await supabase
        .from("profiles")
        .select("*")
        .eq("email", authenticatedEmail)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<Profile>();
      profile = fallback.data;
      profileError = fallback.error;
    }

    if (!profile?.role) {
      await supabase.auth.signOut();
      setError("Role not assigned. Please contact admin.");
      setIsLoading(false);
      return;
    }

    const normalizedRole = profile.role.trim().toLowerCase() as UserRole;
    const normalizedStatus =
      typeof profile?.status === "string" ? profile.status.trim().toLowerCase() : null;

    if (!validRoles.has(normalizedRole)) {
      await supabase.auth.signOut();
      setError("Role not assigned. Please contact admin.");
      setIsLoading(false);
      return;
    }

    const selectedRoleMatches = (() => {
      if (selectedRole === "admin") {
        return normalizedRole === "admin" || normalizedRole === "super_admin";
      }
      return normalizedRole === selectedRole;
    })();

    if (!selectedRoleMatches) {
      await supabase.auth.signOut();
      setError("Selected role does not match your account access.");
      setIsLoading(false);
      return;
    }

    if (normalizedStatus && normalizedStatus !== "active") {
      await supabase.auth.signOut();
      setError("Your account is inactive. Please contact admin.");
      setIsLoading(false);
      return;
    }

    // Full navigation so auth cookies are sent before the server layout runs.
    window.location.assign(getRoleRedirectPath(normalizedRole));
  };

  return (
    <Card className="w-full max-w-md rounded-2xl border-[#e8dcc8] shadow-sm">
      <CardHeader className="space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#faf3e3] text-[#c9a227]">
          <GraduationCap className="h-5 w-5" />
        </div>
        <CardTitle className="text-2xl text-[#3d3428]">AJ Academy</CardTitle>
        <p className="text-sm text-[#6b5d4d]">Sign in to your dashboard</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#3d3428]">Select role</label>
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as LoginRoleOption)}
              className="h-9 w-full rounded-lg border border-[#e8dcc8] bg-white px-2.5 text-sm outline-none focus-visible:border-[#c9a227] focus-visible:ring-2 focus-visible:ring-[#c9a227]/30"
              required
            >
              <option value="admin">Admin</option>
              <option value="student">Student</option>
              <option value="freelancer">Freelancer</option>
              <option value="mentor">Mentor</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#3d3428]">Email</label>
            <Input
              type="email"
              placeholder="you@ajacademy.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="border-[#e8dcc8]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#3d3428]">Password</label>
            <Input
              type="password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="border-[#e8dcc8]"
            />
          </div>

          {resetNotice ? <p className="text-sm text-emerald-700">{resetNotice}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
          <Link
            href="/forgot-password"
            className="block text-center text-sm font-medium text-[#a68b2e] hover:underline"
          >
            Forgot password?
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
