"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  OFFLINE_ACTION_MESSAGE,
  PWA_BUILD_STORAGE_KEY,
  PWA_BUILD_VERSION,
  PWA_ONLINE_EVENT,
  SW_URL,
} from "@/lib/pwa/constants";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { MobileInstallHelp } from "@/components/pwa/MobileInstallHelp";
import { isPwaStandalone, markPwaInstallComplete } from "@/lib/pwa/install-state";

type PwaContextValue = {
  isOnline: boolean;
  offlineActionMessage: string;
};

const PwaContext = createContext<PwaContextValue>({
  isOnline: true,
  offlineActionMessage: OFFLINE_ACTION_MESSAGE,
});

export function usePwa() {
  return useContext(PwaContext);
}

function blockOfflineAction(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const blocked = target.closest("[data-requires-online]");
  if (!blocked) return;
  if (navigator.onLine) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("bb-os-offline-action", {
        detail: { message: OFFLINE_ACTION_MESSAGE },
      }),
    );
  }
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [offlineToast, setOfflineToast] = useState<string | null>(null);

  const refreshLiveData = useCallback(() => {
    router.refresh();
    window.dispatchEvent(new Event(PWA_ONLINE_EVENT));
    try {
      const supabase = createClient();
      void supabase.auth.getSession();
    } catch {
      /* session refresh is best-effort */
    }
  }, [router]);

  useEffect(() => {
    if (isPwaStandalone()) {
      markPwaInstallComplete();
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const onOnline = () => {
      setIsOnline(true);
      setOfflineToast(null);
      refreshLiveData();
    };
    const onOffline = () => setIsOnline(false);
    const onOfflineAction = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setOfflineToast(detail?.message ?? OFFLINE_ACTION_MESSAGE);
      window.setTimeout(() => setOfflineToast(null), 4000);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("bb-os-offline-action", onOfflineAction as EventListener);
    document.addEventListener("click", blockOfflineAction, true);
    document.addEventListener("submit", blockOfflineAction, true);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("bb-os-offline-action", onOfflineAction as EventListener);
      document.removeEventListener("click", blockOfflineAction, true);
      document.removeEventListener("submit", blockOfflineAction, true);
    };
  }, [refreshLiveData]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const setup = async () => {
      try {
        if (window.localStorage.getItem(PWA_BUILD_STORAGE_KEY) !== PWA_BUILD_VERSION) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys.filter((key) => key.startsWith("bb-os-")).map((key) => caches.delete(key)),
            );
          }
          window.localStorage.setItem(PWA_BUILD_STORAGE_KEY, PWA_BUILD_VERSION);
        }

        const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch {
        /* SW optional — app still works without it */
      }
    };

    if (document.readyState === "complete") {
      void setup();
    } else {
      window.addEventListener("load", () => void setup(), { once: true });
    }
  }, []);

  const value = useMemo(
    () => ({ isOnline, offlineActionMessage: OFFLINE_ACTION_MESSAGE }),
    [isOnline],
  );

  return (
    <PwaContext.Provider value={value}>
      <OfflineBanner isOnline={isOnline} />
      <InstallPrompt />
      <MobileInstallHelp />
      {offlineToast ? (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-[200] w-[min(100vw-2rem,24rem)] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 shadow-lg sm:bottom-6"
        >
          {offlineToast}
        </div>
      ) : null}
      {children}
    </PwaContext.Provider>
  );
}
