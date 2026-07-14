import { LoginForm } from "@/components/auth/LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reset?: string; email?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <div className="aj-auth-canvas">
      <LoginForm
        initialError={params.error}
        resetSuccess={params.reset === "ok"}
        initialEmail={params.email ?? ""}
      />
    </div>
  );
}
