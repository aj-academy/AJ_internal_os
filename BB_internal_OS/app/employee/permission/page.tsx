import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";

type PermissionRequest = {
  id: string;
  permission_date: string;
  from_time: string | null;
  to_time: string | null;
  permission_type: string | null;
  reason: string | null;
  description: string | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string;
};

const permissionTypes = [
  "Late Coming",
  "Early Leaving",
  "Personal Permission",
  "Medical Permission",
  "Client Visit",
  "Half Day",
];

async function submitPermissionRequest(formData: FormData) {
  "use server";
  const { profile } = await requireRole(["employee"]);
  const supabase = await createClient();

  const permissionDate = String(formData.get("permission_date") ?? "");
  const fromTime = String(formData.get("from_time") ?? "");
  const toTime = String(formData.get("to_time") ?? "");
  const permissionType = String(formData.get("permission_type") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const description = String(formData.get("description") ?? "");

  if (!permissionDate || !permissionType || !reason) {
    redirect("/employee/permission?status=error&message=Please%20fill%20required%20fields");
  }

  const { error } = await supabase.from("permission_requests").insert({
    employee_id: profile.id,
    permission_date: permissionDate,
    from_time: fromTime || null,
    to_time: toTime || null,
    permission_type: permissionType,
    reason,
    description,
    status: "pending",
  });

  if (error) {
    redirect(`/employee/permission?status=error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/employee/permission");
  revalidatePath("/admin/attendance", "layout");
  revalidatePath("/admin/attendance");
  redirect("/employee/permission?status=success");
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Badge({ value }: { value: string }) {
  const lowered = value.toLowerCase();
  const color =
    lowered === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : lowered === "rejected"
        ? "bg-rose-100 text-rose-700"
        : "bg-amber-100 text-amber-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{value}</span>;
}

export default async function EmployeePermissionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await requireRole(["employee"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("permission_requests")
    .select("id,permission_date,from_time,to_time,permission_type,reason,description,status,rejection_reason,created_at")
    .eq("employee_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<PermissionRequest[]>();

  const rows = data ?? [];
  const errorMessage = (error?.message ?? "").toLowerCase();
  const tableMissing =
    Boolean(errorMessage) &&
    (errorMessage.includes("could not find the table") ||
      errorMessage.includes("relation") ||
      errorMessage.includes("permission_requests"));

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-slate-900">My Permission Requests</h2>
        <p className="text-sm text-slate-600">Submit permission requests for admin approval and track status.</p>
      </header>

      {params.status === "success" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Permission request submitted successfully.
        </div>
      ) : null}
      {params.status === "error" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {params.message ?? "Unable to submit permission request."}
        </div>
      ) : null}
      {tableMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Permission module is not initialized in database. Run `permission_requests_schema.sql` in Supabase SQL Editor, then refresh.
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4">
        <form action={submitPermissionRequest} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input name="permission_date" type="date" required className="h-10 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
          <input name="from_time" type="time" className="h-10 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
          <input name="to_time" type="time" className="h-10 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
          <select name="permission_type" required className="h-10 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
            <option value="">Select Permission Type</option>
            {permissionTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input name="reason" required placeholder="Reason" className="h-10 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
          <input name="description" placeholder="Description" className="h-10 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
          <div className="xl:col-span-3">
            <button className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Submit Permission Request</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
        <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-[#f1f6fc] text-[#64748b]">
              <tr>
                {["Permission Date", "From Time", "To Time", "Permission Type", "Reason", "Description", "Status", "Rejection Reason", "Requested On"].map((h) => (
                  <th key={h} className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8edf5] text-slate-700">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{formatDate(row.permission_date)}</td>
                  <td className="px-4 py-3">{formatTime(row.from_time)}</td>
                  <td className="px-4 py-3">{formatTime(row.to_time)}</td>
                  <td className="px-4 py-3">{row.permission_type ?? "-"}</td>
                  <td className="px-4 py-3">{row.reason ?? "-"}</td>
                  <td className="px-4 py-3">{row.description ?? "-"}</td>
                  <td className="px-4 py-3"><Badge value={row.status ?? "pending"} /></td>
                  <td className="px-4 py-3">{row.rejection_reason ?? "-"}</td>
                  <td className="px-4 py-3">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No permission requests submitted yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
