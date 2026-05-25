"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  FileText,
  Loader2,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface FreelancerRow {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  status: string | null;
  created_at: string;
}

const PIPELINE = [
  { stage: "Prospect", hint: "Identified talent; NDA & scope not signed yet." },
  { stage: "Onboarding", hint: "Contract signed; access issued; policies acknowledged." },
  { stage: "Active", hint: "Delivering milestones; timesheets & reviews in CRM rhythm." },
  { stage: "Offboarding", hint: "Final deliverables; revoke access; retain work history." },
  { stage: "Completed", hint: "Engagement closed; login removed; tasks archived." },
] as const;

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function AdminFreelancersPage() {
  const [freelancers, setFreelancers] = useState<FreelancerRow[]>([]);
  const [taskStats, setTaskStats] = useState({ completed: 0, open: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [offboardingId, setOffboardingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: listError } = await supabase
      .from("profiles")
      .select("id,full_name,email,department,status,created_at")
      .eq("role", "freelancer")
      .order("created_at", { ascending: false });

    if (listError) {
      setError(listError.message);
      setFreelancers([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as FreelancerRow[];
    setFreelancers(rows);

    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { count: completed } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "Completed")
        .in("assigned_to", ids);
      const { count: open } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .neq("status", "Completed")
        .in("assigned_to", ids);
      setTaskStats({ completed: completed ?? 0, open: open ?? 0 });
    } else {
      setTaskStats({ completed: 0, open: 0 });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return freelancers;
    return freelancers.filter(
      (f) =>
        f.full_name.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        (f.department ?? "").toLowerCase().includes(q),
    );
  }, [freelancers, search]);

  const activeCount = freelancers.filter((f) => (f.status ?? "active") === "active").length;

  const onOffboard = async (row: FreelancerRow) => {
    const confirmed = window.confirm(
      `Offboard ${row.full_name}?\n\nLogin credentials will be deleted. Completed task records stay in the system with their name on file.`,
    );
    if (!confirmed) return;

    setOffboardingId(row.id);
    setError(null);
    const res = await fetch(`/api/admin/employees/${row.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setOffboardingId(null);
    if (!res.ok) {
      setError(await readApiError(res, "Offboard failed."));
      return;
    }
    await load();
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Admin · CRM</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#0f172a]">Freelance management</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#64748b]">
            HubSpot- and Salesforce-style contractor lifecycle: policies, pipeline, roster, and safe offboarding.
            Add freelancers in{" "}
            <Link href="/admin/employee-master" className="font-medium text-[#c9a227] hover:underline">
              User Master
            </Link>{" "}
            with role <strong>freelancer</strong>.
          </p>
        </div>
        <Link
          href="/admin/employee-master"
          className="inline-flex h-9 items-center rounded-full bg-[#c9a227] px-4 text-sm font-medium text-white hover:bg-[#b8921f]"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add freelancer
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-[#e8dcc8] py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-8 w-8 text-[#c9a227]" />
            <div>
              <p className="text-xs text-[#64748b]">Active freelancers</p>
              <p className="text-2xl font-semibold text-[#0f172a]">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e8dcc8] py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-xs text-[#64748b]">Completed tasks</p>
              <p className="text-2xl font-semibold text-[#0f172a]">{taskStats.completed}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e8dcc8] py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <Briefcase className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-xs text-[#64748b]">Open tasks</p>
              <p className="text-2xl font-semibold text-[#0f172a]">{taskStats.open}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e8dcc8] py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <Shield className="h-8 w-8 text-[#3d3428]" />
            <div>
              <p className="text-xs text-[#64748b]">Policies</p>
              <Link href="/admin/policies?tab=freelancer" className="text-sm font-semibold text-[#c9a227] hover:underline">
                Freelancer policies →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-lg text-slate-900">Engagement pipeline</CardTitle>
          <p className="text-xs text-[#64748b]">Benchmark CRM stages for contractor governance</p>
        </CardHeader>
        <CardContent className="grid gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((step, index) => (
            <div
              key={step.stage}
              className="rounded-xl border border-[#e8edf5] bg-[#faf8f3] px-3 py-3"
            >
              <p className="text-xs font-semibold uppercase text-[#c9a227]">Stage {index + 1}</p>
              <p className="mt-1 font-semibold text-[#0f172a]">{step.stage}</p>
              <p className="mt-1 text-xs text-[#64748b]">{step.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[#dbe6f3] py-0 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-lg text-slate-900">Freelancer roster</CardTitle>
          <Input
            placeholder="Search name, email, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2 h-9 max-w-md rounded-xl border-[#e8dcc8]"
          />
        </CardHeader>
        <CardContent className="pb-4">
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No freelancers yet. Create one in User Master.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-[#f1f6fc] text-[#64748b]">
                  <tr>
                    {["Name", "Department", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8edf5]">
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.full_name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="px-4 py-3">{row.department ?? "—"}</td>
                      <td className="px-4 py-3 capitalize">{row.status ?? "active"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/task-assignment?assignee=${row.id}`}
                            className="inline-flex h-8 items-center rounded-lg border border-[#e8dcc8] bg-white px-3 text-xs font-medium text-[#475569] hover:bg-[#faf8f3]"
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            Tasks
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                            disabled={offboardingId === row.id}
                            onClick={() => void onOffboard(row)}
                          >
                            {offboardingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            Offboard
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[#e8dcc8] bg-[#faf8f3] py-0 shadow-sm">
        <CardContent className="space-y-2 p-4 text-sm text-[#475569]">
          <p className="font-semibold text-[#0f172a]">Recommended freelancer policies (add under Company Policies)</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Independent contractor agreement &amp; IP assignment</li>
            <li>Confidentiality &amp; data handling (NDA)</li>
            <li>Payment terms, invoicing, and tax documentation</li>
            <li>Acceptable use &amp; security (devices, credentials)</li>
            <li>Deliverable quality, revisions, and sign-off</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
