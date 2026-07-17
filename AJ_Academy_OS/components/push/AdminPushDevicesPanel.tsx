"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type DeviceRow = {
  id: string;
  employeeName: string;
  deviceName: string | null;
  platform: string | null;
  browser: string | null;
  isActive: boolean;
  permissionStatus: string;
  notificationsAfterLogout: boolean;
  lastSeenAt: string;
  createdAt: string;
  disabledAt: string | null;
  disabledReason: string | null;
  tokenHint: string;
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminPushDevicesPanel() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/push-devices", { credentials: "include" });
      const json = (await res.json()) as { devices?: DeviceRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load devices.");
      setDevices(json.devices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (deviceId: string, action: "revoke" | "test") => {
    setBusyId(deviceId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/push-devices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, action }),
      });
      const json = (await res.json()) as { error?: string; succeeded?: number };
      if (!res.ok) throw new Error(json.error || "Action failed.");
      setMsg(action === "test" ? `Test sent (${json.succeeded ?? 0} device(s)).` : "Device revoked.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-6 space-y-3 rounded-[16px] border border-[#e8dcc8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0f172a]">Push devices (FCM)</p>
          <p className="text-xs text-[#64748b]">Tokens are masked. Revoking stops alerts on that device only.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[#334155]">{msg}</p> : null}
      {loading ? <p className="text-sm text-[#64748b]">Loading…</p> : null}
      {!loading && !devices.length ? (
        <p className="text-sm text-[#64748b]">No registered devices yet.</p>
      ) : null}
      {devices.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs text-[#334155]">
            <thead className="border-b border-[#e8dcc8] text-[10px] uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-2 py-2">Employee</th>
                <th className="px-2 py-2">Device</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">After logout</th>
                <th className="px-2 py-2">Last seen</th>
                <th className="px-2 py-2">Token</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-[#f1f5f9]">
                  <td className="px-2 py-2 font-medium text-[#0f172a]">{d.employeeName}</td>
                  <td className="px-2 py-2">
                    {[d.deviceName, d.browser, d.platform].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-2 py-2">
                    {d.isActive ? (
                      <span className="text-emerald-700">Active</span>
                    ) : (
                      <span className="text-rose-700" title={d.disabledReason ?? undefined}>
                        Inactive
                      </span>
                    )}
                    <span className="mt-0.5 block text-[10px] text-[#94a3b8]">{d.permissionStatus}</span>
                  </td>
                  <td className="px-2 py-2">{d.notificationsAfterLogout ? "Yes" : "No"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmt(d.lastSeenAt)}</td>
                  <td className="px-2 py-2 font-mono text-[10px]">{d.tokenHint}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {d.isActive ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === d.id}
                            onClick={() => void act(d.id, "test")}
                          >
                            Test
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === d.id}
                            className="text-rose-700"
                            onClick={() => {
                              if (confirm("Revoke this device? Notifications will stop.")) {
                                void act(d.id, "revoke");
                              }
                            }}
                          >
                            Revoke
                          </Button>
                        </>
                      ) : (
                        <span className="text-[10px] text-[#94a3b8]">{fmt(d.disabledAt)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
