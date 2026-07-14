"use client";

import Link from "next/link";

export function InstallLoginLink() {
  return (
    <Link
      href="/login"
      className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-[#c9a227] text-sm font-semibold text-white transition hover:bg-[#b8921f]"
    >
      Continue to login
    </Link>
  );
}
