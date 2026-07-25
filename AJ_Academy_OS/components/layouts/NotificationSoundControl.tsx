"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canPlayNotificationSound,
  getNotificationSoundSettings,
  muteNotificationSoundTemporarily,
  playNotificationSound,
  setNotificationSoundSettings,
  subscribeNotificationSoundChange,
  turnNotificationSoundOff,
  turnNotificationSoundOn,
} from "@/lib/notifications/notificationSound";

export function NotificationSoundControl() {
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(() => getNotificationSoundSettings());
  const [mutedNow, setMutedNow] = useState(false);

  const refresh = useCallback(() => {
    setSettings(getNotificationSoundSettings());
    setMutedNow(!canPlayNotificationSound());
  }, []);

  useEffect(() => {
    refresh();
    return subscribeNotificationSoundChange(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const statusLabel = mutedNow
    ? "Muted - alerts are silent"
    : settings.enabled
      ? "On - alerts will play"
      : "Off - turn sound on to hear alerts";

  return (
    <div className="relative" ref={popRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={[
          "touch-target h-9 w-9 rounded-full border-[#e8dcc8] bg-white sm:h-10 sm:w-auto sm:gap-1.5 sm:px-3",
          mutedNow || !settings.enabled ? "text-[#94a3b8]" : "text-[#2563eb]",
        ].join(" ")}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notification sound settings"
        title="Notification sound"
      >
        {mutedNow || !settings.enabled ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        <span className="hidden text-xs font-medium sm:inline">Sound</span>
      </Button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close sound settings"
            className="fixed inset-0 z-[70] bg-slate-900/35 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-3 top-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] z-[71] rounded-2xl border border-[#dbe6f3] bg-white p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(100vw-2rem,300px)] sm:rounded-xl sm:shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Notification sound</p>
            <p className="mt-1 text-sm text-[#334155]">{statusLabel}</p>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-[#64748b]">
                <span>Volume</span>
                <span>{settings.volume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.volume}
                onChange={(e) => {
                  const volume = Number(e.target.value);
                  setNotificationSoundSettings({ enabled: true, volume });
                  if (typeof window !== "undefined") sessionStorage.removeItem("aj-academy-notification-mute-until");
                }}
                className="h-2 w-full cursor-pointer accent-[#2563eb]"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button
                type="button"
                className="text-[#2563eb] hover:underline"
                onClick={() => {
                  muteNotificationSoundTemporarily(30);
                  refresh();
                }}
              >
                Mute temporarily
              </button>
              <button
                type="button"
                className="text-[#2563eb] hover:underline"
                onClick={() => {
                  turnNotificationSoundOff();
                  refresh();
                }}
              >
                Turn sound off
              </button>
              {!settings.enabled ? (
                <button
                  type="button"
                  className="text-[#2563eb] hover:underline"
                  onClick={() => {
                    turnNotificationSoundOn();
                    refresh();
                  }}
                >
                  Turn sound on
                </button>
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-4 h-10 w-full rounded-lg border-[#dbe6f3] text-sm sm:h-9"
              onClick={() => playNotificationSound(true)}
            >
              Test sound
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
