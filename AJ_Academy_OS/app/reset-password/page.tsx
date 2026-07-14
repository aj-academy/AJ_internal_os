"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [booting, setBooting] = useState(true);
  const [accountEmail, setAccountEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();

    const finishBoot = (ready: boolean, message = "") => {
      setSessionReady(ready);
      if (message) setError(message);
      setBooting(false);
    };

    const bootstrap = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          finishBoot(false, "Reset link is invalid or expired. Please request a new link from Forgot password.");
          return;
        }
        window.history.replaceState({}, "", "/reset-password");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.email) {
        setAccountEmail(session.user.email);
        finishBoot(true);
        return;
      }

      finishBoot(
        false,
        "Reset session expired. Open the link from your email again, or request a new reset link.",
      );
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session?.user) {
        setAccountEmail(session.user.email ?? "");
        setSessionReady(true);
        setBooting(false);
        setError("");
      }
    });

    void bootstrap();
    return () => subscription.unsubscribe();
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!sessionReady) {
      setError("Reset session expired. Please open the link from your email again.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsSaving(false);
      return;
    }

    await supabase.auth.signOut();
    setNotice("Password updated. Redirecting to login…");
    setIsSaving(false);

    const loginQuery = new URLSearchParams({ reset: "ok" });
    if (accountEmail) loginQuery.set("email", accountEmail);

    setTimeout(() => router.replace(`/login?${loginQuery.toString()}`), 900);
  };

  return (
    <div className="aj-auth-canvas">
      <Card className="aj-auth-card border-[#e8dcc8] py-1 shadow-none">
        <CardHeader className="space-y-3 px-5 pt-6 sm:px-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e8dcc8] bg-[#faf3e3] text-[#a68b2e]">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="aj-page-kicker">Account recovery</p>
            <CardTitle className="text-2xl tracking-tight text-[#3d3428]">Set new password</CardTitle>
            {accountEmail ? (
              <p className="text-sm leading-relaxed text-[#6b5d4d]">Account: {accountEmail}</p>
            ) : (
              <p className="text-sm leading-relaxed text-[#6b5d4d]">
                Choose a strong password to finish resetting your account.
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-6">
          {booting ? (
            <p className="flex items-center gap-2 text-sm text-[#6b5d4d]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying reset link…
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="aj-field">
                <label className="aj-field-label" htmlFor="new-password">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={!sessionReady || isSaving}
                  autoComplete="new-password"
                />
              </div>
              <div className="aj-field">
                <label className="aj-field-label" htmlFor="confirm-password">
                  Confirm password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={!sessionReady || isSaving}
                  autoComplete="new-password"
                />
              </div>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              {notice ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {notice}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={!sessionReady || isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSaving ? "Saving…" : "Save new password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
