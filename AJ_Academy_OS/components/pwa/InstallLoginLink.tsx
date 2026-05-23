"use client";

import Link from "next/link";
import { markPwaInstallComplete } from "@/lib/pwa/install-state";

export function InstallLoginLink() {
  return (
    <Link
      href="/login"
      onClick={() => markPwaInstallComplete()}
      className="mt-5 flex h-11 w-full items-center justify-center rounded-full bg-[#1e4f91] text-sm font-medium text-white hover:bg-[#163a6d]"
    >
      Open login
    </Link>
  );
}
