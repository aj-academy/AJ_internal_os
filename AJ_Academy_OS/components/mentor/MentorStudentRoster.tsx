import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

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

export async function MentorStudentRoster({ mentorId, department }: MentorStudentRosterProps) {
  const supabase = await createClient();
  const dept = department?.trim() ?? "";

  let students: StudentRow[] = [];

  if (dept) {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,email,department,course,status,assigned_mentor_id")
      .eq("role", "student")
      .ilike("department", dept)
      .order("full_name", { ascending: true })
      .limit(100);
    students = (data ?? []) as StudentRow[];
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,email,department,course,status,assigned_mentor_id")
      .eq("role", "student")
      .eq("assigned_mentor_id", mentorId)
      .order("full_name", { ascending: true })
      .limit(100);
    students = (data ?? []) as StudentRow[];
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
                ? `Students in your department (${dept}). ${assignedCount} assigned to you as primary mentor.`
                : "Students assigned to you as primary mentor. Set your department in User Master to see your full batch."}
            </p>
          </div>
        </div>
        <p className="text-sm font-medium text-[#a68b2e]">{students.length} student(s)</p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#f0e6d4]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#faf3e3] text-xs uppercase tracking-wide text-[#a68b2e]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Batch / dept</th>
              <th className="px-3 py-2">Course</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Primary mentor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0e6d4] text-[#3d3428]">
            {students.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[#6b5d4d]">
                  No students in your roster yet. Ask admin to set your department or assign students to you.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.id}>
                  <td className="px-3 py-2 font-medium">{student.full_name || "—"}</td>
                  <td className="px-3 py-2 text-[#6b5d4d]">{student.email || "—"}</td>
                  <td className="px-3 py-2">{student.department || "—"}</td>
                  <td className="px-3 py-2">{student.course || "—"}</td>
                  <td className="px-3 py-2 capitalize">{student.status || "—"}</td>
                  <td className="px-3 py-2">
                    {student.assigned_mentor_id === mentorId ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        You
                      </span>
                    ) : (
                      <span className="text-xs text-[#6b5d4d]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
