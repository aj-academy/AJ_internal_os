"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
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
  const endpoints = ["/api/first-login", "/api/auth/first-login"];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 404) {
      continue;
    }

    if (response.ok) {
      return { ok: true };
    }

    if (response.status === 409) {
      return { ok: false, alreadyInitialized: true };
    }

    return {
      ok: false,
      alreadyInitialized: false,
      error: await parseApiError(response, "Could not initialize first login."),
    };
  }

  return { ok: false, alreadyInitialized: true };
}

export function LoginForm({ initialError, resetSuccess = false, initialEmail = "" }: LoginFormProps) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<"admin" | "employee" | "manager" | "accounts">("employee");
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
    "manager",
    "employee",
    "accounts",
  ]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const supabase = createClient();
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
          ? "Incorrect email or password. Use Forgot / change password if you reset it, or ask admin to reset your password in Employee Master."
          : authMessage || "Invalid credentials.";
      setError(firstLoginError ?? friendlyAuthError);
      setIsLoading(false);
      return;
    }

    const {
      data: { user: authenticatedUser },
      error: authenticatedUserError,
    } = await supabase.auth.getUser();

    const authenticatedUserId = signInData.user.id;
    const authenticatedEmail =
      authenticatedUser?.email?.trim().toLowerCase() ?? normalizedEmail;

    const profilesRlsHint =
      "Re-apply get_user_role() from BB_internal_SB/schema.sql (must include SET row_security = off), or run Section A of BB_internal_SB/attendance_module.sql, then re-run BB_internal_SB/attendance_rls.sql if policies are outdated.";

    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authenticatedUserId)
      .maybeSingle<Profile>();

    if (profileError && !profile) {
      await supabase.auth.signOut();
      setError(
        `Could not load your profile (${profileError.message}). If this persists, ask an admin: ${profilesRlsHint}`,
      );
      setIsLoading(false);
      return;
    }

    if (!profile) {
      const fallback = await supabase
        .from("profiles")
        .select("*")
        .eq("email", authenticatedEmail.toLowerCase())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<Profile>();

      profile = fallback.data;
      profileError = fallback.error;
    }

    if (profileError && !profile) {
      await supabase.auth.signOut();
      setError(
        `Could not load your profile (${profileError.message}). If this persists, ask an admin: ${profilesRlsHint}`,
      );
      setIsLoading(false);
      return;
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

    if (authenticatedUserError) {
      await supabase.auth.signOut();
      setError("Unable to verify session. Please try again.");
      setIsLoading(false);
      return;
    }

    router.replace(getRoleRedirectPath(normalizedRole));
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md rounded-2xl border-blue-100 shadow-sm">
      <CardHeader className="space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <CardTitle className="text-2xl">BB Internal OS Login</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Select Role</label>
            <select
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(event.target.value as "admin" | "employee" | "manager" | "accounts")
              }
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              required
            >
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="accounts">Accounts</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <Input
              type="password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="text-xs text-slate-500">
              Use the initial password your administrator created in Employee Master, or your current password if you have updated it.
            </p>
          </div>

          {resetNotice ? <p className="text-sm text-emerald-700">{resetNotice}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
          <Link
            href="/forgot-password"
            className="block text-center text-sm font-medium text-blue-700 hover:underline"
          >
            Forgot / change password?
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
