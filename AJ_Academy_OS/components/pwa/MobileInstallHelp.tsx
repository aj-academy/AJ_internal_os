"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { PWA_APP_NAME } from "@/lib/pwa/branding";
import {
  hasCompletedPwaInstall,
  isPwaStandalone,
  markPwaInstallComplete,
  PWA_INSTALLED_PENDING_ICON_KEY,
  PWA_MOBILE_HELP_DISMISS_KEY,
} from "@/lib/pwa/install-state";

function isMobile() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function MobileInstallHelp() {
  const [visible, setVisible] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [installedPendingIcon, setInstalledPendingIcon] = useState(false);

  useEffect(() => {
    if (isPwaStandalone()) {
      markPwaInstallComplete();
      return;
    }

    if (hasCompletedPwaInstall()) {
      return;
    }

    if (!isMobile()) {
      return;
    }

    setInstallUrl(`${window.location.origin}/login`);
    setInstalledPendingIcon(window.localStorage.getItem(PWA_INSTALLED_PENDING_ICON_KEY) === "1");

    if (window.localStorage.getItem(PWA_MOBILE_HELP_DISMISS_KEY) === "1") {
      return;
    }

    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[85] rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl sm:inset-x-auto sm:right-4 sm:max-w-sm"
      role="dialog"
      aria-label="Install on phone"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#faf3e3] text-[#c9a227]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#3d3428]">
              {installedPendingIcon ? "Installed - find the icon" : "Install on your phone (with icon)"}
            </p>
            <p className="mt-1 text-xs text-[#6b5d4d]">
              {installedPendingIcon
                ? "Do not tap Add to Home screen again. Check the app drawer first."
                : "If it opens inside Chrome, you added a shortcut - not the full app."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            markPwaInstallComplete();
            setVisible(false);
          }}
          className="touch-target rounded-full p-1 text-[#6b5d4d]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {isIos() ? (
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-[#3d3428]">
          <li>Open in <strong>Safari</strong> (not WhatsApp).</li>
          <li>Share, then Add to Home Screen, then Add.</li>
          <li>Open only from the {PWA_APP_NAME} home screen icon.</li>
        </ol>
      ) : installedPendingIcon ? (
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-[#3d3428]">
          <li>Swipe up and open <strong>All apps / App drawer</strong>.</li>
          <li>
            Search for <strong>{PWA_APP_NAME}</strong>.
          </li>
          <li>Long-press the icon, then <strong>Add to Home screen</strong>.</li>
          <li>
            <strong>Stop tapping Install</strong> in Chrome - that can cause an installing loop.
          </li>
        </ol>
      ) : (
        <>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-[#3d3428]">
            <li>Open in <strong>Chrome</strong> (Open in Chrome from WhatsApp).</li>
            <li>Menu, then <strong>Install app</strong> (once only).</li>
            <li>
              If no home icon, check <strong>App drawer</strong> for {PWA_APP_NAME}.
            </li>
          </ol>
          {installUrl ? (
            <p className="mt-3 break-all rounded-lg bg-[#faf3e3] px-3 py-2 font-mono text-[11px] text-[#3d3428]">
              Install only from: <strong>{installUrl}</strong>
            </p>
          ) : null}
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <strong>Still showing the old blue icon?</strong> Android keeps the previous app icon even after
            you remove the shortcut. Remove every {PWA_APP_NAME} / old app icon from the home screen, then
            Chrome ? Settings ? Site settings ? your site ? <strong>Clear &amp; reset</strong>. Also check
            Chrome ? Settings ? Apps ? installed web apps and remove old entries. Force-close Chrome, open the
            URL above, and tap <strong>Install app</strong> once.
          </p>
        </>
      )}
      <p className="mt-3 rounded-lg bg-[#faf3e3] px-3 py-2 text-xs text-[#6b5d4d]">
        Real app = no Chrome address bar at the top.
      </p>
    </div>
  );
}
