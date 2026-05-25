import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#faf8f3] px-6 text-center">
      <h1 className="text-2xl font-semibold text-[#3d3428]">Page not found</h1>
      <p className="max-w-md text-sm text-[#6b5d4d]">
        This URL does not exist. Start at the login page. If you deployed from GitHub, ensure Vercel{" "}
        <strong>Root Directory</strong> is set to <code className="rounded bg-white px-1">AJ_Academy_OS</code>.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-[#c9a227] px-5 py-2 text-sm font-medium text-white hover:bg-[#b8921f]"
      >
        Go to login
      </Link>
    </main>
  );
}
