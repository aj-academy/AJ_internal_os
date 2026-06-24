"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLogo } from "@/components/branding/AppLogo";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeLoginProfile, type LoginProfileRow } from "@/lib/auth/profileSelect";
import { validateLoginProfile, type LoginRoleOption } from "@/lib/auth/validateLoginProfile";
import { getRoleRedirectPath } from "@/lib/auth/roleRedirect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface LoginFormProps {
  initialError?: string;
  resetSuccess?: boolean;
  initialEmail?: string;
}

async function accountNeedsFirstLogin(email: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("/api/auth/needs-first-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { needsFirstLogin?: boolean };
    return Boolean(payload.needsFirstLogin);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

const ERROR_MAP: Record<string, string> = {
  missing_role:
    "Could not load your profile on the server after sign-in. Sign in again (wait for “Signing in…” to finish). If it repeats, run profiles_rls_fix.sql in Supabase.",
  inactive: "Your account is inactive. Please contact admin.",
  session:
    "Server could not read your login session. Sign in again and wait until redirect completes.",
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

async function initializeFirstLogin(payload: {
  email: string;
  role: string;
  password: string;
}): Promise<FirstLoginResult> {
  const response = await fetch("/api/auth/first-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) return { ok: true };
  if (response.status === 409) return { ok: false, alreadyInitialized: true };

  return {
    ok: false,
    alreadyInitialized: false,
    error: await parseApiError(response, "Could not initialize first login."),
  };
}

async function syncSessionToServer(
  session: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
    user?: unknown;
  },
  profile: LoginProfileRow,
) {
  return fetch("/api/auth/set-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ session, profile }),
  });
}

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid email or password")) {
    return "Incorrect email or password. In Supabase → Authentication → Users, reset the password for this email, then try again.";
  }
  return message || "Invalid credentials.";
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (initialError === "session" || initialError === "missing_role") {
      window.history.replaceState(null, "", "/login");
      if (initialError === "missing_role") {
        void fetch("/api/auth/clear-session", { method: "POST", credentials: "include" });
      }
    }
  }, [initialError]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    let firstLoginError: string | null = null;

    let supabase;
    try {
      supabase = createClient();
    } catch (configError) {
      setError(configError instanceof Error ? configError.message : "Supabase is not configured.");
      setIsLoading(false);
      return;
    }

    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError || !signInData.user) {
      const isInvalidPassword =
        (signInError?.message ?? "").toLowerCase().includes("invalid login credentials") ||
        (signInError?.message ?? "").toLowerCase().includes("invalid email or password");
      const tryFirstLogin =
        !resetSuccess && isInvalidPassword && (await accountNeedsFirstLogin(normalizedEmail));

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
      setError(firstLoginError ?? friendlyAuthError(signInError?.message ?? ""));
      setIsLoading(false);
      return;
    }

    if (signInData.session) {
      await supabase.auth.setSession({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
    }

    await supabase.auth.getSession();

    const authUserId = signInData.user.id;
    const authEmail = (signInData.user.email ?? normalizedEmail).trim().toLowerCase();
    const sessionForProfile =
      signInData.session ?? (await supabase.auth.getSession()).data.session;

    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      console.log("[login] auth user id", authUserId);
      console.log("[login] auth email", authEmail);
    }

    let profile: LoginProfileRow | null = null;
    let loadError: string | null = null;

    const byId = await supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("id", authUserId)
      .maybeSingle<LoginProfileRow>();

    if (isDev) {
      console.log("[login] profile by id result", {
        data: byId.data,
        error: byId.error?.message ?? null,
      });
    }

    if (byId.error) {
      loadError = byId.error.message;
    }

    if (byId.data) {
      profile = normalizeLoginProfile(byId.data);
    }

    if (!profile) {
      const byEmail = await supabase
        .from("profiles")
        .select("id,full_name,email,role")
        .eq("email", normalizedEmail)
        .maybeSingle<LoginProfileRow>();

      if (isDev) {
        console.log("[login] profile by email result", {
          data: byEmail.data,
          error: byEmail.error?.message ?? null,
        });
      }

      if (byEmail.error) {
        loadError = byEmail.error.message;
      }

      if (byEmail.data) {
        profile = normalizeLoginProfile(byEmail.data);
        if (profile.id !== authUserId) {
          console.warn(
            "Profile email found but id mismatch with auth user id.",
            { authUserId, profileId: profile.id, email: profile.email },
          );
        }
      }
    }

    if (isDev) {
      console.log("[login] profile result", profile);
      console.log("[login] final profile role", profile?.role?.toLowerCase() ?? "(none)");
    }

    if (!profile?.role) {
      await supabase.auth.signOut();
      setError(
        loadError
          ? `Could not load profile (${loadError}). Run profiles_rls_fix.sql in Supabase.`
          : "Profile not found. Ensure public.profiles has your email and role.",
      );
      setIsLoading(false);
      return;
    }

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/login");
    }

    const validation = validateLoginProfile(profile, selectedRole);
    if (!validation.ok) {
      await supabase.auth.signOut();
      setError(validation.error);
      setIsLoading(false);
      return;
    }

    if (!sessionForProfile?.access_token || !sessionForProfile.refresh_token) {
      await supabase.auth.signOut();
      setError("Sign-in succeeded but no session was created. Try again.");
      setIsLoading(false);
      return;
    }

    const redirectTo = getRoleRedirectPath(validation.role);

    if (process.env.NODE_ENV !== "production") {
      console.log("[login] redirect path", redirectTo);
    }

    try {
      const syncResponse = await syncSessionToServer(
        {
          access_token: sessionForProfile.access_token,
          refresh_token: sessionForProfile.refresh_token,
          expires_in: sessionForProfile.expires_in,
          expires_at: sessionForProfile.expires_at,
          token_type: sessionForProfile.token_type,
          user: sessionForProfile.user,
        },
        profile,
      );

      if (!syncResponse.ok) {
        await supabase.auth.signOut();
        setError(
          "Login succeeded but the server session could not be saved. Please try signing in again.",
        );
        setIsLoading(false);
        return;
      }
    } catch {
      await supabase.auth.signOut();
      setError("Could not reach the server to save your session. Check that npm run dev is running.");
      setIsLoading(false);
      return;
    }

    window.location.replace(redirectTo);
  };

  return (
    <Card className="w-full max-w-md rounded-2xl border-[#e8dcc8] shadow-sm">
      <CardHeader className="space-y-2">
        <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-1">
          <AppLogo size={52} className="h-full w-full" priority />
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
              <option value="employee">Employee</option>
              <option value="student">Student</option>
              <option value="freelancer">Freelancer</option>
              <option value="mentor">Mentor</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#3d3428]">Email</label>
            <Input
              type="email"
              placeholder="admin123@gmail.com"
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
