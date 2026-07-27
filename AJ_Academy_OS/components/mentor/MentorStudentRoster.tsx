import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MentorStudentRosterTable } from "@/components/mentor/MentorStudentRosterTable";

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  course: string | null;
  status: string | null;
  assigned_mentor_id: string | null;
};

type MentorStudentRosterProps = {
  mentorId: string;
  department: string | null;
};

/**
 * Same-department active students only — matches get_department_task_assignees()
 * used by Assign Tasks (case/whitespace-insensitive department match).
 */
export async function MentorStudentRoster({ mentorId, department }: MentorStudentRosterProps) {
  const supabase = await createClient();
  const dept = department?.trim() ?? "";

  let students: StudentRow[] = [];

  if (dept) {
    const { data: assignees, error: rpcError } = await supabase.rpc("get_department_task_assignees");

    if (!rpcError && Array.isArray(assignees) && assignees.length) {
      const ids = (assignees as { id: string }[]).map((a) => a.id).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id,full_name,email,department,course,status,assigned_mentor_id")
          .in("id", ids)
          .order("full_name", { ascending: true });
        students = (data ?? []) as StudentRow[];
      }
    } else {
      // Fallback if RPC missing: active students, case-insensitive department match
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,department,course,status,assigned_mentor_id")
        .eq("role", "student")
        .ilike("status", "active")
        .ilike("department", dept)
        .order("full_name", { ascending: true })
        .limit(100);
      students = ((data ?? []) as StudentRow[]).filter(
        (s) => (s.department ?? "").trim().toLowerCase() === dept.toLowerCase(),
      );
    }
  }

  const assignedCount = students.filter((s) => s.assigned_mentor_id === mentorId).length;

  return (
    <article className="rounded-2xl border border-[#e8dcc8] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f0e6d4] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf3e3] text-[#c9a227]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[#3d3428]">Student roster</h2>
            <p className="text-sm text-[#6b5d4d]">
              {dept
                ? `Active students in your department (${dept}). ${assignedCount} assigned to you as primary mentor.`
                : "Set your department in User Master to see active students in that department (same list as Assign Tasks)."}
            </p>
          </div>
        </div>
        <p className="text-sm font-medium text-[#a68b2e]">{students.length} student(s)</p>
      </div>

      <MentorStudentRosterTable students={students} mentorId={mentorId} />
    </article>
  );
}
