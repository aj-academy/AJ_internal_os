"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyPolicy } from "@/types/company-policy";

export default function AdminPoliciesPage() {
  const [policies, setPolicies] = useState<CompanyPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [policy_url, setPolicyUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/policies");
    const payload = (await res.json()) as { policies?: CompanyPolicy[]; error?: string };
    if (!res.ok) {
      setError(payload.error ?? "Could not load policies.");
      setPolicies([]);
    } else {
      setPolicies(payload.policies ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), policy_url: policy_url.trim() }),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) {
      setSubmitting(false);
      setError(payload.error ?? "Could not add policy.");
      return;
    }
    setName("");
    setPolicyUrl("");
    await loadPolicies();
    setSubmitting(false);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this policy? Employees who already agreed keep their record; new employees will not see a deleted policy.")) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/policies/${id}`, { method: "DELETE" });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(payload.error ?? "Could not delete.");
      return;
    }
    await loadPolicies();
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Admin Control</p>
        <h2 className="mt-2 text-3xl font-semibold text-[#0f172a]">Company policies</h2>
        <p className="mt-2 text-sm text-[#64748b]">
          Add policy names and document links (for example Google Drive). Employees must agree after login when new policies are pending.
        </p>
      </div>

      <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-lg text-slate-900">Add policy</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onAdd}>
            <Input
              placeholder="Policy name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-xl border-[#cfdceb]"
              required
            />
            <Input
              placeholder="Policy URL (https://…)"
              value={policy_url}
              onChange={(e) => setPolicyUrl(e.target.value)}
              className="h-9 rounded-xl border-[#cfdceb]"
              required
            />
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button
                type="submit"
                className="rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add policy
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-lg text-slate-900">Policies ({policies.length})</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : policies.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No policies yet. Add one above.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[#f1f6fc] text-[#64748b]">
                  <tr>
                    {["Policy name", "URL", ""].map((h) => (
                      <th key={h || "actions"} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                  {policies.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                      <td className="max-w-[320px] truncate px-4 py-3">
                        <a
                          href={p.policy_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2563eb] hover:underline"
                        >
                          {p.policy_url}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => void onDelete(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
