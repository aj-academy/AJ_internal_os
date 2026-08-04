"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { AppLogo } from "@/components/branding/AppLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/security/validate";

const NEUTRAL =
  "If an AJ OS account exists for this email address, a password-reset link has been sent.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError("");
    setNotice("");

    if (!normalizedEmail) {
      setError("Enter your registered email address.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (Date.now() < cooldownUntil) {
      setNotice(NEUTRAL);
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (response.status === 429) {
        setError("Too many requests. Please try again later.");
        return;
      }
      if (response.status === 400 && payload.error) {
        setError(payload.error);
        return;
      }

      // Always show neutral copy on success-path responses (including soft infra failures).
      setNotice(payload.message || NEUTRAL);
      setCooldownUntil(Date.now() + 30_000);
    } catch {
      setNotice(NEUTRAL);
      setCooldownUntil(Date.now() + 30_000);
    } finally {
      setIsSending(false);
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
              Forgot Your Password?
            </CardTitle>
            <p className="text-sm leading-relaxed text-[#6b5d4d]">
              Enter your registered email address and we will send you a secure password-reset link.
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
                disabled={isSending}
              />
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

            <Button type="submit" className="w-full" disabled={isSending}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {isSending ? "Sending reset link…" : "Send Reset Link"}
            </Button>

            <Link
              href="/login"
              className="block text-center text-sm font-medium text-[#a68b2e] transition hover:text-[#b8921f] hover:underline"
            >
              Back to Login
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
