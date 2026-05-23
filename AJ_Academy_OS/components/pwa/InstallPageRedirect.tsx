"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasCompletedPwaInstall, isPwaStandalone, markPwaInstallComplete } from "@/lib/pwa/install-state";

/** Skip install instructions when the app is already on the home screen or setup was done once. */
export function InstallPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (isPwaStandalone() || hasCompletedPwaInstall()) {
      if (isPwaStandalone()) markPwaInstallComplete();
      router.replace("/login");
    }
  }, [router]);

  return null;
}
