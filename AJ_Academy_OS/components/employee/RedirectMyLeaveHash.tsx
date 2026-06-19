"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Old links used /employee/dashboard#my-leave — full dashboard still rendered. Send users to the leave-only page. */
export function RedirectMyLeaveHash() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/employee/dashboard") return;
    const hash = window.location.hash;
    if (!hash) return;
    if (hash.includes("my-leave")) {
      router.replace("/employee/leave");
    }
  }, [pathname, router]);

  return null;
}
