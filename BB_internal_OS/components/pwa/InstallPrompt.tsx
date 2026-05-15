"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "bb-os-pwa-install-dismissed";
export const PWA_INSTALLED_PENDING_ICON_KEY = "bb-os-pwa-installed-pending-icon";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);
      return;
    }

    if (typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1") {
      setHidden(true);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      if (window.localStorage.getItem(DISMISS_KEY) !== "1") {
        setHidden(false);
      }
    };

    const onInstalled = () => {
      window.localStorage.setItem(PWA_INSTALLED_PENDING_ICON_KEY, "1");
      setDeferred(null);
      setHidden(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || !deferred || isStandalone()) return null;

  const onInstall = async () => {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setHidden(true);
    }
    setDeferred(null);
  };

  const onDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
    setDeferred(null);
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[90] flex w-[min(100vw-2rem,22rem)] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-[#d4deea] bg-white p-4 shadow-xl sm:left-auto sm:right-4 sm:translate-x-0"
      role="dialog"
      aria-label="Install app"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[#0f172a]">Install BB Internal OS</p>
        <button
          type="button"
          onClick={onDismiss}
          className="touch-target rounded-full p-1 text-[#64748b] hover:bg-[#f1f5f9]"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-[#64748b]">Add to your home screen for quick access in standalone mode.</p>
      <Button
        type="button"
        className="h-9 w-full rounded-full bg-[#1e4f91] text-white hover:bg-[#163a6d]"
        onClick={() => void onInstall()}
      >
        <Download className="mr-2 h-4 w-4" />
        Install BB Internal OS
      </Button>
    </div>
  );
}
