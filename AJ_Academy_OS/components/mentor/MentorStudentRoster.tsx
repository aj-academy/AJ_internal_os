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

      <MentorStudentRosterTable students={students} mentorId={mentorId} />
    </article>
  );
}
