"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Old links used /employee/dashboard#my-leave or /employee/permission — send users to the combined page. */
export function RedirectMyLeaveHash() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/employee/dashboard") {
      const hash = window.location.hash;
      if (hash?.includes("my-leave")) {
        router.replace("/employee/leave#leave");
        return;
      }
    }
    if (pathname === "/employee/permission") {
      router.replace("/employee/leave#permission");
    }
  }, [pathname, router]);

  return null;
}
