"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "bb-os-mobile-install-help-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobile() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function MobileInstallHelp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[85] rounded-2xl border border-[#c9d8eb] bg-white p-4 shadow-xl sm:inset-x-auto sm:right-4 sm:max-w-sm" role="dialog" aria-label="Install on phone">
      <div className="flex items-start justify-between gap-2">
        <div className="flex gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#1e4f91]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">Install on your phone (with icon)</p>
            <p className="mt-1 text-xs text-[#64748b]">If it opens inside Chrome, you added a shortcut — not the real app.</p>
          </div>
        </div>
        <button type="button" onClick={() => { window.localStorage.setItem(DISMISS_KEY, "1"); setVisible(false); }} className="touch-target rounded-full p-1 text-[#64748b]" aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
      {isIos() ? (
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-[#334155]">
          <li>Open in <strong>Safari</strong> (not WhatsApp).</li>
          <li>Share → Add to Home Screen → Add.</li>
          <li>Open only from the home screen BB icon.</li>
        </ol>
      ) : (
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-[#334155]">
          <li>Open in <strong>Chrome</strong> (Open in Chrome from WhatsApp).</li>
          <li>Menu ⋮ → Install app / Add to Home screen.</li>
          <li>Open only from the home screen BB icon.</li>
        </ol>
      )}
      <p className="mt-3 rounded-lg bg-[#f8fbff] px-3 py-2 text-xs text-[#475569]">Real app = no Chrome address bar at the top.</p>
    </div>
  );
}
