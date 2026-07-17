import { LoginForm } from "@/components/auth/LoginForm";
import { safeRelativePath } from "@/lib/security/safeRedirect";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reset?: string; email?: string; redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const initialRedirect = safeRelativePath(params.redirect, "");

  return (
    <div className="aj-auth-canvas">
      <LoginForm
        initialError={params.error}
        resetSuccess={params.reset === "ok"}
        initialEmail={params.email ?? ""}
        initialRedirect={initialRedirect === "/" ? "" : initialRedirect}
      />
    </div>
  );
}
