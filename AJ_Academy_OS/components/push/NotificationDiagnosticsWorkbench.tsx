"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  enablePushNotifications,
  refreshFcmToken,
  sendDebugPush,
  sendTestPush,
  showLocalTestNotification,
  subscribeForegroundMessages,
} from "@/lib/push/clientPush";
import { getFirebasePublicConfig, getFirebaseVapidKey } from "@/lib/firebase/client";
import { isPwaStandalone } from "@/lib/pwa/install-state";
import {
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/notificationSound";

type Health = {
  firebaseClientConfigured?: boolean;
  firebaseAdminConfigured?: boolean;
  projectIdsMatch?: boolean;
  databaseConfigured?: boolean;
  privateKeyFormatOk?: boolean;
  vapidKeyPresent?: boolean;
  clientProjectId?: string | null;
  serverProjectId?: string | null;
  missingClientEnv?: string[];
  missingServerEnv?: string[];
  showSystemNotificationInForeground?: boolean;
};

type DeviceRow = {
  id: string;
  deviceName: string | null;
  isActive: boolean;
  notificationsAfterLogout: boolean;
  permissionStatus: string;
  lastSeenAt: string;
  tokenHint: string;
  disabledReason: string | null;
};

type LogLine = { t: string; ok: boolean; text: string };

function now() {
  return new Date().toLocaleTimeString();
}

export function NotificationDiagnosticsWorkbench() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [tokenHint, setTokenHint] = useState<string | null>(null);
  const [fgCount, setFgCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [swInfo, setSwInfo] = useState<string>("");

  const pushLog = (ok: boolean, text: string) => {
    setLogs((prev) => [{ t: now(), ok, text }, ...prev].slice(0, 80));
  };

  const refreshSwInfo = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      setSwInfo("Service workers unsupported");
      return;
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    const lines = regs.map((r) => {
      const src = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "(none)";
      const state = r.active?.state || r.waiting?.state || r.installing?.state || "unknown";
      return `${src} | scope=${r.scope} | state=${state} | controlling=${navigator.serviceWorker.controller?.scriptURL === r.active?.scriptURL}`;
    });
    setSwInfo(lines.length ? lines.join("\n") : "No service workers registered");
  }, []);

  const loadHealth = useCallback(async () => {
    const res = await fetch("/api/notifications/health", { credentials: "include" });
    const json = (await res.json()) as Health;
    setHealth(json);
    pushLog(res.ok, `Health: client=${json.firebaseClientConfigured} admin=${json.firebaseAdminConfigured} match=${json.projectIdsMatch}`);
  }, []);

  const loadDevices = useCallback(async () => {
    const res = await fetch("/api/push/diagnostics/me", { credentials: "include" });
    const json = (await res.json()) as { ok?: boolean; devices?: DeviceRow[]; error?: string; activeCount?: number };
    if (!res.ok) {
      pushLog(false, json.error || "Device inspect failed");
      setDevices([]);
      return;
    }
    setDevices(json.devices ?? []);
    pushLog(true, `Devices: active=${json.activeCount ?? 0} total=${json.devices?.length ?? 0}`);
  }, []);

  useEffect(() => {
    void loadHealth();
    void loadDevices();
    void refreshSwInfo();
    let unsub: (() => void) | null = null;
    void subscribeForegroundMessages(() => {
      setFgCount((n) => n + 1);
      pushLog(true, "Foreground onMessage received");
    }).then((u) => {
      unsub = u;
    });
    return () => unsub?.();
  }, [loadDevices, loadHealth, refreshSwInfo]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      pushLog(false, `${label}: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setBusy(false);
      void refreshSwInfo();
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const https = typeof window !== "undefined" ? window.location.protocol === "https:" || origin.startsWith("http://localhost") : false;
  const cfg = getFirebasePublicConfig();
  const vapid = Boolean(getFirebaseVapidKey());

  const copyReport = async () => {
    const report = {
      origin,
      https,
      permission: typeof Notification !== "undefined" ? Notification.permission : "n/a",
      pwaStandalone: isPwaStandalone(),
      health,
      tokenHint,
      devices,
      swInfo,
      foregroundMessages: fgCount,
      logs: logs.slice(0, 30),
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    pushLog(true, "Safe diagnostic report copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0f172a]">Notification diagnostics</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Debug FCM end-to-end. Tokens are masked. Never paste private keys into this page.
        </p>
      </div>

      <section className="rounded-xl border border-[#e8dcc8] bg-white p-4 text-sm">
        <h2 className="font-semibold text-[#0f172a]">Environment snapshot</h2>
        <ul className="mt-2 grid gap-1 text-xs text-[#334155] sm:grid-cols-2">
          <li>Origin: {origin || "—"}</li>
          <li>HTTPS / localhost: {https ? "yes" : "NO"}</li>
          <li>Notification API: {typeof Notification !== "undefined" ? "yes" : "no"}</li>
          <li>Permission: {typeof Notification !== "undefined" ? Notification.permission : "n/a"}</li>
          <li>SW support: {"serviceWorker" in navigator ? "yes" : "no"}</li>
          <li>PWA standalone: {isPwaStandalone() ? "yes" : "no"}</li>
          <li>Firebase client init: {cfg ? "yes" : "no"}</li>
          <li>VAPID present (client): {vapid ? "yes" : "no"}</li>
          <li>Client project: {health?.clientProjectId || cfg?.projectId || "—"}</li>
          <li>Server project: {health?.serverProjectId || "—"}</li>
          <li>Admin configured: {String(health?.firebaseAdminConfigured)}</li>
          <li>Private key format OK: {String(health?.privateKeyFormatOk)}</li>
          <li>Project IDs match: {String(health?.projectIdsMatch)}</li>
          <li>Masked FCM token: {tokenHint || "—"}</li>
          <li>Foreground messages: {fgCount}</li>
          <li>FG system notification: {String(health?.showSystemNotificationInForeground ?? true)}</li>
        </ul>
        {health?.missingClientEnv?.length ? (
          <p className="mt-2 text-xs text-rose-700">Missing client env: {health.missingClientEnv.join(", ")}</p>
        ) : null}
        {health?.missingServerEnv?.length ? (
          <p className="mt-1 text-xs text-rose-700">Missing server env: {health.missingServerEnv.join(", ")}</p>
        ) : null}
        <pre className="mt-3 max-h-28 overflow-auto rounded-lg bg-[#f8fafc] p-2 text-[10px] text-[#475569]">{swInfo}</pre>
      </section>

      <section className="rounded-xl border border-[#e8dcc8] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0f172a]">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void run("permission", async () => {
            const p = await Notification.requestPermission();
            pushLog(p === "granted", `Permission → ${p}`);
          })}>
            Request Notification Permission
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("sw", async () => {
            const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            await navigator.serviceWorker.ready;
            pushLog(true, `SW registered: ${reg.active?.scriptURL || reg.scope}`);
          })}>
            Register Service Worker
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("token", async () => {
            const r = await refreshFcmToken();
            if (r.ok) {
              setTokenHint(r.tokenHint);
              pushLog(true, `FCM token OK (${r.tokenHint})`);
            } else pushLog(false, r.error);
          })}>
            Refresh FCM Token
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("enable", async () => {
            const r = await enablePushNotifications({ notificationsAfterLogout: true });
            if (r.ok) {
              pushLog(true, "Enable + save to Supabase OK");
              await loadDevices();
            } else pushLog(false, r.error);
          })}>
            Save Token to Supabase
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            disabled={busy}
            onClick={() =>
              void run("sound", async () => {
                unlockNotificationAudio();
                playNotificationSound(true);
                pushLog(true, "Played AJ OS chime (in-app). If silent, click the speaker icon in the top bar → Test sound.");
              })
            }
          >
            Play Test Sound (AJ OS chime)
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("local", async () => {
            unlockNotificationAudio();
            playNotificationSound(true);
            const r = await showLocalTestNotification();
            pushLog(r.ok, r.ok ? "Local notification + chime shown" : r.error || "Local failed");
          })}>
            Display Local Browser Notification
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("test", async () => {
            unlockNotificationAudio();
            playNotificationSound(true);
            const r = await sendTestPush();
            pushLog(r.ok, r.ok ? `Test API: ${JSON.stringify(r.detail)}` : r.error || "Test failed");
          })}>
            Send Test Notification (API)
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("probe", async () => {
            const res = await fetch("/api/push/admin-probe", { method: "POST", credentials: "include" });
            const json = await res.json().catch(() => ({}));
            pushLog(Boolean((json as { ok?: boolean }).ok), `Admin probe: ${JSON.stringify(json)}`);
          })}>
            Probe Firebase Admin Credential
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("debug", async () => {
            const r = await sendDebugPush(true);
            if (r.ok) {
              pushLog(true, `Debug send: ${JSON.stringify(r.detail)}`);
            } else {
              pushLog(false, `${r.error || "Debug failed"} | ${JSON.stringify(r.detail ?? {})}`);
            }
          })}>
            Send Debug to All My Devices
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run("inspect", async () => {
            await loadDevices();
            await loadHealth();
          })}>
            Inspect Device Registration
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void copyReport()}>
            Copy Safe Diagnostic Report
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-[#e8dcc8] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0f172a]">Your push_devices</h2>
        {!devices.length ? (
          <p className="mt-2 text-xs text-[#64748b]">No rows yet — run Save Token to Supabase.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-[#64748b]">
                <tr>
                  <th className="px-2 py-1">Device</th>
                  <th className="px-2 py-1">Active</th>
                  <th className="px-2 py-1">After logout</th>
                  <th className="px-2 py-1">Last seen</th>
                  <th className="px-2 py-1">Token</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-t border-[#f1f5f9]">
                    <td className="px-2 py-1">{d.deviceName || "—"}</td>
                    <td className="px-2 py-1">{d.isActive ? "yes" : `no (${d.disabledReason || "—"})`}</td>
                    <td className="px-2 py-1">{d.notificationsAfterLogout ? "yes" : "no"}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{new Date(d.lastSeenAt).toLocaleString()}</td>
                    <td className="px-2 py-1 font-mono">{d.tokenHint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
        <p className="font-semibold">Sound — where the options are</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>
            <strong>In-app chime (when AJ OS is open or minimized but still running):</strong> click the{" "}
            <strong>speaker icon</strong> next to the bell → <strong>Test sound</strong>. Or use{" "}
            <strong>Play Test Sound (AJ OS chime)</strong> above. After a push, the service worker asks the open tab to play this chime.
          </li>
          <li>
            <strong>Windows / Edge toast sound:</strong> your screenshot shows toasts via Edge. Open{" "}
            <strong>Windows Settings → System → Notifications → Microsoft Edge</strong> and turn on{" "}
            <em>Play a sound when a notification arrives</em>. Also turn Focus assist / Do Not Disturb off.
          </li>
          <li>
            If Edge is fully closed (no AJ OS tab in memory), only the Windows toast sound can play — not the AJ OS chime.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-[#e8dcc8] bg-[#0f172a] p-4">
        <h2 className="text-sm font-semibold text-white">Action log</h2>
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[11px]">
          {logs.map((l, i) => (
            <li key={`${l.t}-${i}`} className={l.ok ? "text-emerald-300" : "text-rose-300"}>
              [{l.t}] {l.ok ? "PASS" : "FAIL"} — {l.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
