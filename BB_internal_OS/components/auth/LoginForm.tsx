"use client";

import { useState } from "react";
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
}

const ERROR_MAP: Record<string, string> = {
  missing_role: "Role not assigned. Please contact admin.",
  inactive: "Your account is inactive. Please contact admin.",
};

export function LoginForm({ initialError }: LoginFormProps) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<"admin" | "employee" | "manager" | "accounts">("employee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    initialError ? ERROR_MAP[initialError] ?? "Unable to login." : "",
  );
  const [isLoading, setIsLoading] = useState(false);

  const roleMatchesSelection = (actualRole: UserRole) => {
    if (selectedRole === "admin") {
      return actualRole === "admin" || actualRole === "super_admin";
    }
    return actualRole === selectedRole;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const supabase = createClient();
    const normalizedEmail = email.trim().toLowerCase();

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (signInError || !signInData.user) {
      setError(signInError?.message ?? "Invalid credentials.");
      setIsLoading(false);
      return;
    }

    const {
      data: { user: authenticatedUser },
      error: authenticatedUserError,
    } = await supabase.auth.getUser();

    const authenticatedUserId = authenticatedUser?.id ?? signInData.user.id;
    const authenticatedEmail =
      authenticatedUser?.email?.trim().toLowerCase() ?? normalizedEmail;

    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authenticatedUserId)
      .maybeSingle<Profile>();

    if (!profile) {
      const fallback = await supabase
        .from("profiles")
        .select("*")
        .eq("email", authenticatedEmail)
        .maybeSingle<Profile>();

      profile = fallback.data;
      profileError = fallback.error;

      if (fallback.error) {
        profileError = fallback.error;
      }
    }

    if (profileError || !profile?.role) {
      await supabase.auth.signOut();
      setError("Role not assigned. Please contact admin.");
      setIsLoading(false);
      return;
    }

    if (profile.status !== "active") {
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

    if (!roleMatchesSelection(profile.role)) {
      await supabase.auth.signOut();
      setError("Selected role does not match your account access.");
      setIsLoading(false);
      return;
    }

    router.replace(getRoleRedirectPath(profile.role));
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
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
