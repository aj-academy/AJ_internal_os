"use client";

import { TablePagination } from "@/components/ui/TablePagination";
import { usePagination } from "@/lib/usePagination";

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  course: string | null;
  status: string | null;
  assigned_mentor_id: string | null;
};

export function MentorStudentRosterTable({
  students,
  mentorId,
}: {
  students: StudentRow[];
  mentorId: string;
}) {
  const { paginatedItems, page, setPage, totalPages, totalItems, pageSize, setPageSize } = usePagination(students, 10);

  return (
    <>
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
                <td colSpan={6} className="px-4 py-8 text-center text-[#6b5d4d]">
                  No students in your roster yet. Ask admin to set your department or assign students to you.
                </td>
              </tr>
            ) : (
              paginatedItems.map((student) => (
                <tr key={student.id}>
                  <td className="px-3 py-2 font-medium">{student.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{student.email ?? "—"}</td>
                  <td className="px-3 py-2">{student.department ?? "—"}</td>
                  <td className="px-3 py-2">{student.course ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{student.status ?? "—"}</td>
                  <td className="px-3 py-2">
                    {student.assigned_mentor_id === mentorId ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">You</span>
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
      <TablePagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </>
  );
}
