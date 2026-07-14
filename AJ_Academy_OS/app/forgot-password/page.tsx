"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSending, setIsSending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError("");
    setNotice("");

    if (!normalizedEmail) {
      setError("Enter your account email address.");
      return;
    }

    setIsSending(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setNotice("Password reset link sent. Check your email and open the link to set a new password.");
    }

    setIsSending(false);
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
            <CardTitle className="text-2xl tracking-tight text-[#3d3428]">Reset password</CardTitle>
            <p className="text-sm leading-relaxed text-[#6b5d4d]">
              Enter your account email and we will send a secure reset link.
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="aj-field">
              <label className="aj-field-label" htmlFor="forgot-email">
                Email
              </label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@ajacademy.co.in"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
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

            <Button type="submit" className="w-full" disabled={isSending}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSending ? "Sending reset link…" : "Send reset link"}
            </Button>

            <Link
              href="/login"
              className="block text-center text-sm font-medium text-[#a68b2e] transition hover:text-[#b8921f] hover:underline"
            >
              Back to login
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
