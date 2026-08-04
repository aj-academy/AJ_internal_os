"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { AppLogo } from "@/components/branding/AppLogo";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  friendlyAuthPasswordError,
  passwordChecks,
  passwordStrengthLabel,
  passwordStrengthScore,
  validateNewPassword,
} from "@/lib/auth/passwordPolicy";

type PageState = "booting" | "ready" | "invalid" | "success";

export default function AuthResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pageState, setPageState] = useState<PageState>("booting");
  const [accountEmail, setAccountEmail] = useState("");

  const checks = useMemo(() => passwordChecks(password), [password]);
  const score = useMemo(() => passwordStrengthScore(password), [password]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const finishInvalid = (message: string) => {
      if (cancelled) return;
      setPageState("invalid");
      setError(message);
    };

    const finishReady = (email: string) => {
      if (cancelled) return;
      setAccountEmail(email);
      setPageState("ready");
      setError("");
    };

    const bootstrap = async () => {
      const url = new URL(window.location.href);
      const errorParam = url.searchParams.get("error");
      if (errorParam === "invalid" || errorParam === "expired") {
        finishInvalid("This reset link is invalid or has expired.");
        window.history.replaceState({}, "", "/auth/reset-password");
        return;
      }

      // Prefer session established by /auth/callback (PKCE). If a code is still present, exchange it.
      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, "", "/auth/reset-password");
        if (exchangeError) {
          finishInvalid("This reset link is invalid or has expired.");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.email) {
        finishReady(session.user.email);
        return;
      }

      finishInvalid(
        "This reset link is invalid or has expired. Request a new link from Forgot Password.",
      );
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session?.user?.email) {
        finishReady(session.user.email);
      }
    });

    void bootstrap();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (pageState !== "ready") {
      setError("This reset link is invalid or has expired.");
      return;
    }

    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    const supabase = createClient();

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(friendlyAuthPasswordError(updateError.message));
        setIsSaving(false);
        return;
      }

      // Audit while recovery session is still valid; never send the password.
      await fetch("/api/auth/password-reset-complete", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);

      await supabase.auth.signOut();
      setPassword("");
      setConfirmPassword("");
      setPageState("success");
      setNotice("Your password has been reset successfully.");
      setIsSaving(false);

      const loginQuery = new URLSearchParams({ reset: "ok" });
      if (accountEmail) loginQuery.set("email", accountEmail);
      setTimeout(() => router.replace(`/login?${loginQuery.toString()}`), 1200);
    } catch {
      setError("We could not update your password. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <div className="aj-auth-canvas">
      <Card className="aj-auth-card border-[#e8dcc8] py-1 shadow-none">
        <CardHeader className="space-y-3 px-5 pt-6 sm:px-6">
          <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-[#e8dcc8] bg-[#fffdf8]">
            <AppLogo size={56} className="h-full w-full" priority />
          </div>
          <div className="space-y-1">
            <p className="aj-page-kicker">Account recovery</p>
            <CardTitle className="text-2xl tracking-tight text-[#3d3428]">
              Create a New Password
            </CardTitle>
            {accountEmail && pageState === "ready" ? (
              <p className="text-sm leading-relaxed text-[#6b5d4d]">Account: {accountEmail}</p>
            ) : (
              <p className="text-sm leading-relaxed text-[#6b5d4d]">
                Choose a strong password to finish resetting your AJ OS account.
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-6">
          {pageState === "booting" ? (
            <p className="flex items-center gap-2 text-sm text-[#6b5d4d]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying reset link…
            </p>
          ) : null}

          {pageState === "invalid" ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error || "This reset link is invalid or has expired."}
              </p>
              <Link
                href="/forgot-password"
                className="block text-center text-sm font-medium text-[#a68b2e] hover:underline"
              >
                Request a new reset link
              </Link>
              <Link href="/login" className="block text-center text-sm text-[#6b5d4d] hover:underline">
                Back to Login
              </Link>
            </div>
          ) : null}

          {pageState === "success" ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {notice || "Your password has been reset successfully."}
              </p>
              <p className="text-sm text-[#6b5d4d]">Redirecting to login…</p>
            </div>
          ) : null}

          {pageState === "ready" ? (
            <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
              <div className="aj-field">
                <label className="aj-field-label" htmlFor="new-password">
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter a strong password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={isSaving}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#6b5d4d] hover:text-[#3d3428]"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="aj-field">
                <label className="aj-field-label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    disabled={isSaving}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#6b5d4d] hover:text-[#3d3428]"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-3">
                <div className="flex items-center justify-between text-xs text-[#6b5d4d]">
                  <span>Password strength</span>
                  <span className="font-medium text-[#3d3428]">{passwordStrengthLabel(score)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={[
                        "h-1.5 rounded-full",
                        score >= step ? "bg-[#c9a227]" : "bg-[#e8dcc8]",
                      ].join(" ")}
                    />
                  ))}
                </div>
                <ul className="mt-2 space-y-1 text-xs text-[#6b5d4d]">
                  {checks.map((check) => (
                    <li key={check.id} className={check.ok ? "text-emerald-700" : undefined}>
                      {check.ok ? "✓" : "○"} {check.label}
                    </li>
                  ))}
                </ul>
              </div>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {notice}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {isSaving ? "Updating…" : "Update Password"}
              </Button>

              <p className="text-center text-xs text-[#6b5d4d]">
                Need help? Contact your AJ OS administrator.
              </p>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
