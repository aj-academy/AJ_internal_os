"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disablePushOnThisDevice,
  enablePushNotifications,
  getPushSupportStatus,
  sendTestPush,
  type PushPermissionStatus,
} from "@/lib/push/clientPush";

function statusLabel(status: PushPermissionStatus): string {
  switch (status) {
    case "enabled":
      return "Enabled";
    case "disabled":
      return "Disabled";
    case "denied":
      return "Permission denied";
    case "default":
      return "Permission not requested";
    case "unsupported":
      return "Browser unsupported";
    case "unconfigured":
      return "Firebase not configured";
    case "sw_unavailable":
      return "Service worker unavailable";
    case "token_failed":
      return "Token registration failed";
    default:
      return status;
  }
}

export function PushDeviceSettings() {
  const [status, setStatus] = useState<PushPermissionStatus>("default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [afterLogout, setAfterLogout] = useState(true);

  const refresh = useCallback(async () => {
    const s = await getPushSupportStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnable = async () => {
    setBusy(true);
    setMsg(null);
    const result = await enablePushNotifications({ notificationsAfterLogout: afterLogout });
    if (result.ok) {
      setStatus("enabled");
      setMsg("Notifications enabled on this device. They continue after normal logout.");
    } else {
      setStatus(result.status);
      setMsg(result.error);
    }
    setBusy(false);
  };

  const onTest = async () => {
    setBusy(true);
    setMsg(null);
    const result = await sendTestPush();
    setMsg(result.ok ? "Test notification sent. Check this device." : result.error || "Test failed.");
    setBusy(false);
  };

  const onDisable = async () => {
    setBusy(true);
    setMsg(null);
    const result = await disablePushOnThisDevice("user_disabled");
    if (result.ok) {
      setStatus("disabled");
      setMsg("Notifications disabled on this device only.");
    } else {
      setMsg(result.error || "Could not disable notifications.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3 rounded-[16px] border border-[#dbe6f3] bg-[#f8fbff] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-[#e8edf5] text-[#2563eb]">
          <Bell className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0f172a]">Device push notifications</p>
          <p className="mt-1 text-xs text-[#64748b]">
            Receive AJ OS alerts when the tab is closed or you are logged out. Full details open only after you sign in.
          </p>
          <p className="mt-2 text-xs font-medium text-[#334155]">
            Status: <span className="text-[#0f172a]">{statusLabel(status)}</span>
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-[#e8edf5] bg-white px-3 py-2 text-sm text-[#334155]">
        <input
          type="checkbox"
          className="mt-1 rounded border-[#cfdceb]"
          checked={afterLogout}
          onChange={(e) => setAfterLogout(e.target.checked)}
          disabled={busy}
        />
        <span>
          <span className="font-medium text-[#0f172a]">Notifications after logout</span>
          <span className="mt-0.5 block text-xs text-[#64748b]">
            Keep alerts on this device after normal Logout. Use “Log Out and Stop Notifications” to turn them off.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          className="rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
          onClick={() => void onEnable()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
          Enable Notifications
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="rounded-xl border-[#dbe6f3]"
          onClick={() => void onTest()}
        >
          <Send className="mr-2 h-4 w-4" />
          Send Test Notification
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
          onClick={() => void onDisable()}
        >
          <BellOff className="mr-2 h-4 w-4" />
          Disable on This Device
        </Button>
      </div>

      {msg ? <p className="text-xs font-medium text-[#334155]">{msg}</p> : null}
      <p className="text-[11px] text-[#94a3b8]">
        Delivery is best-effort. OS battery restrictions, blocked permissions, or cleared site data can stop push.
        Custom notification sounds are not supported in the web PWA.
      </p>
    </div>
  );
}
