import Link from "next/link";
import { ClipboardList, Users } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";

export default async function MentorDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();
  const uid = user?.id;

  let openTasks = 0;
  let assignedTasks = 0;

  if (uid) {
    const [openRes, assignedRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .neq("status", "Completed"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_by", uid),
    ]);
    openTasks = openRes.count ?? 0;
    assignedTasks = assignedRes.count ?? 0;
  }

  const firstName = (profile?.full_name ?? "Mentor").split(" ")[0];

  return (
    <div className="dashboard-section space-y-6">
      <header className="rounded-[24px] border border-[#e8dcc8] bg-gradient-to-br from-[#fffdf8] to-[#faf3e3] p-6 shadow-sm">
        <p className="text-sm font-medium text-[#a68b2e]">AJ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#3d3428] sm:text-3xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 text-sm text-[#6b5d4d]">
          Review tasks assigned to you and track work you assign to students.
        </p>
      </header>

      <div className="stat-cards-grid">
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">My open tasks</p>
          <p className="mt-2 text-3xl font-semibold text-[#3d3428]">{openTasks}</p>
        </article>
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Tasks I assigned</p>
          <p className="mt-2 text-3xl font-semibold text-[#3d3428]">{assignedTasks}</p>
        </article>
      </div>

      <Link
        href="/mentor/my-tasks"
        className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
      >
        <ClipboardList className="mt-0.5 h-6 w-6 text-[#c9a227]" />
        <div>
          <h2 className="font-semibold text-[#3d3428]">My Tasks</h2>
          <p className="mt-1 text-sm text-[#6b5d4d]">Tasks assigned to you by admins.</p>
        </div>
      </Link>

      <article className="rounded-2xl border border-dashed border-[#e8dcc8] bg-[#fffdf8] p-5 text-sm text-[#6b5d4d]">
        <Users className="mb-2 h-5 w-5 text-[#c9a227]" />
        Student roster and batch management can be added in a future phase from the admin panel.
      </article>
    </div>
  );
}
