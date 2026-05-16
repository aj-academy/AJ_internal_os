"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import {
  type EmployeeDocumentRow,
  type EmployeeProfileDetails,
  mapRowToProfileDetails,
  maskAccount,
  maskAadhaar,
  maskPan,
  emptyProfileDetails,
} from "@/lib/employeeProfile";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  designation: string | null;
  status: string | null;
  created_at: string | null;
};

type EmployeeDetailsRow = {
  employee_code: string | null;
  phone: string | null;
  joined_at: string | null;
  manager_id: string | null;
  employment_type: string | null;
};

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatAddress(
  line1: string | null,
  line2: string | null,
  city: string | null,
  state: string | null,
  pincode: string | null,
  country: string | null,
) {
  const parts = [
    line1,
    line2,
    [city, state].filter(Boolean).join(", ") || null,
    pincode,
    country,
  ].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(", ") : "—";
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
      <div className="text-xs font-medium text-[#94a3b8]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#0f172a] break-words">{value}</div>
    </div>
  );
}

function SectionTitle({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#e8edf5] pb-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-xs font-bold text-white">
        {letter}
      </div>
      <div className="text-sm font-semibold uppercase tracking-wide text-[#0f172a]">{title}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <div className="text-sm text-[#64748b]">—</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <div
          key={item}
          className="inline-flex rounded-full bg-[#eff6ff] px-2.5 py-1 text-xs font-medium text-[#1d4ed8]"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

function LinkValue({ href }: { href: string | null }) {
  if (!href?.trim()) return <div>—</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#2563eb] underline break-all">
      {href}
    </a>
  );
}

function verificationBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "verified") return "bg-emerald-100 text-emerald-700";
  if (s === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-800";
}

export function AdminEmployeeProfileView({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetailsRow | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [details, setDetails] = useState<EmployeeProfileDetails>(() => emptyProfileDetails(profileId));
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [revealSensitive, setRevealSensitive] = useState({ account: false, pan: false, aadhaar: false });
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [profileRes, edRes, epdRes, docsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,role,department,designation,status,created_at")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("employee_details")
          .select("employee_code,phone,joined_at,manager_id,employment_type")
          .eq("employee_id", profileId)
          .maybeSingle(),
        supabase.from("employee_profile_details").select("*").eq("profile_id", profileId).maybeSingle(),
        supabase
          .from("employee_documents")
          .select("*")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false }),
      ]);

      if (profileRes.error) throw new Error(profileRes.error.message);
      if (!profileRes.data) throw new Error("Employee profile not found.");
      setProfile(profileRes.data as ProfileRow);

      if (edRes.error) throw new Error(edRes.error.message);
      const ed = (edRes.data as EmployeeDetailsRow | null) ?? null;
      setEmployeeDetails(ed);

      if (ed?.manager_id) {
        const { data: mgr } = await supabase.from("profiles").select("full_name").eq("id", ed.manager_id).maybeSingle();
        setManagerName((mgr?.full_name as string | null) ?? null);
      } else {
        setManagerName(null);
      }

      if (epdRes.error) throw new Error(epdRes.error.message);
      setDetails(
        epdRes.data
          ? mapRowToProfileDetails(epdRes.data as Record<string, unknown>, profileId)
          : emptyProfileDetails(profileId),
      );

      if (docsRes.error) throw new Error(docsRes.error.message);
      setDocuments((docsRes.data ?? []) as EmployeeDocumentRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load employee profile.");
    } finally {
      setLoading(false);
    }
  }, [profileId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const viewDocument = async (doc: EmployeeDocumentRow) => {
    setActionError(null);
    const path = doc.storage_path?.trim();
    if (!path) {
      setActionError("Document has no storage path.");
      return;
    }
    const { data, error: urlError } = await supabase.storage.from("employee-documents").createSignedUrl(path, 3600);
    if (urlError || !data?.signedUrl) {
      setActionError(urlError?.message ?? "Could not open document.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const verifyDocument = async (docId: string) => {
    setDocBusyId(docId);
    setActionError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in.");

      const { error: updateError } = await supabase
        .from("employee_documents")
        .update({
          verification_status: "Verified",
          verified_by: uid,
          verified_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", docId);

      if (updateError) throw new Error(updateError.message);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not verify document.");
    } finally {
      setDocBusyId(null);
    }
  };

  const rejectDocument = async (doc: EmployeeDocumentRow) => {
    const reason = window.prompt("Rejection reason (required):", doc.rejection_reason ?? "");
    if (reason === null) return;
    if (!reason.trim()) {
      setActionError("Rejection reason is required.");
      return;
    }

    setDocBusyId(doc.id);
    setActionError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in.");

      const { error: updateError } = await supabase
        .from("employee_documents")
        .update({
          verification_status: "Rejected",
          verified_by: uid,
          verified_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
        })
        .eq("id", doc.id);

      if (updateError) throw new Error(updateError.message);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not reject document.");
    } finally {
      setDocBusyId(null);
    }
  };

  const initials = (profile?.full_name ?? "E")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const notifEntries = Object.entries(details.notification_preferences ?? {}).filter(([, v]) => v);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="button"
        tabIndex={0}
        aria-label="Close"
      />
      <div className="relative z-[71] flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[#d4deea] bg-white shadow-[0_24px_48px_rgba(30,64,175,0.18)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e8edf5] px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Employee profile</div>
            <div className="mt-1 truncate text-xl font-semibold text-[#0f172a]">
              {profile?.full_name ?? "Loading…"}
            </div>
            <div className="truncate text-sm text-[#64748b]">{profile?.email ?? ""}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d4deea] text-[#64748b] hover:bg-[#f8fbff]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#64748b]">
              <Loader2 className="h-5 w-5 animate-spin text-[#2563eb]" />
              Loading profile…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-col gap-4 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4 sm:flex-row sm:items-center">
                {details.profile_photo_url ? (
                  <img
                    src={details.profile_photo_url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-[#2563eb] ring-1 ring-[#dbe6f3]">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-[#0f172a]">{display(profile?.full_name)}</div>
                  <div className="text-sm text-[#64748b]">{display(employeeDetails?.employee_code)}</div>
                  <div className="mt-2 inline-flex rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-semibold text-[#1d4ed8]">
                    Profile completion {details.profile_completion}%
                  </div>
                </div>
              </div>

              {actionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {actionError}
                </div>
              ) : null}

              {/* A Official Details */}
              <div className="space-y-3">
                <SectionTitle letter="A" title="Official Details" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Employee code" value={display(employeeDetails?.employee_code)} />
                  <Field label="Full name" value={display(profile?.full_name)} />
                  <Field label="Work email" value={display(profile?.email)} />
                  <Field label="Work phone" value={display(employeeDetails?.phone)} />
                  <Field label="Role" value={display(profile?.role?.replace("_", " "))} />
                  <Field label="Department" value={display(profile?.department)} />
                  <Field label="Designation" value={display(profile?.designation)} />
                  <Field label="Reporting manager" value={display(managerName)} />
                  <Field label="Joining date" value={formatDateIST(employeeDetails?.joined_at)} />
                  <Field label="Employment type" value={display(employeeDetails?.employment_type)} />
                  <Field label="Status" value={display(profile?.status)} />
                  <Field label="Record since" value={formatDateTimeIST(profile?.created_at)} />
                </div>
              </div>

              {/* B Personal */}
              <div className="space-y-3">
                <SectionTitle letter="B" title="Personal Details" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Preferred name" value={display(details.preferred_name)} />
                  <Field label="Date of birth" value={formatDateIST(details.date_of_birth)} />
                  <Field label="Gender" value={display(details.gender)} />
                  <Field label="Blood group" value={display(details.blood_group)} />
                  <Field label="Marital status" value={display(details.marital_status)} />
                  <Field label="Nationality" value={display(details.nationality)} />
                  <Field label="Personal email" value={display(details.personal_email)} />
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3 sm:col-span-2">
                    <div className="text-xs font-medium text-[#94a3b8]">Bio</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-[#0f172a]">{display(details.bio)}</div>
                  </div>
                </div>
              </div>

              {/* C Contact & Address */}
              <div className="space-y-3">
                <SectionTitle letter="C" title="Contact & Address" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Personal mobile" value={display(details.personal_mobile)} />
                  <Field label="Alternate mobile" value={display(details.alternate_mobile)} />
                  <Field label="Personal email" value={display(details.personal_email)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#e8edf5] bg-[#fbfdff] p-3 sm:col-span-2">
                    <div className="text-xs font-semibold uppercase text-[#94a3b8]">Current address</div>
                    <div className="mt-1 text-sm text-[#0f172a]">
                      {formatAddress(
                        details.current_address_line1,
                        details.current_address_line2,
                        details.current_city,
                        details.current_state,
                        details.current_pincode,
                        details.current_country,
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8edf5] bg-[#fbfdff] p-3 sm:col-span-2">
                    <div className="text-xs font-semibold uppercase text-[#94a3b8]">Permanent address</div>
                    <div className="mt-1 text-sm text-[#0f172a]">
                      {details.same_as_current
                        ? "Same as current address"
                        : formatAddress(
                            details.permanent_address_line1,
                            details.permanent_address_line2,
                            details.permanent_city,
                            details.permanent_state,
                            details.permanent_pincode,
                            details.permanent_country,
                          )}
                    </div>
                  </div>
                </div>
              </div>

              {/* D Emergency */}
              <div className="space-y-3">
                <SectionTitle letter="D" title="Emergency Contacts" />
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-4 space-y-2">
                    <div className="text-xs font-semibold uppercase text-[#64748b]">Emergency contact 1</div>
                    <Field label="Name" value={display(details.emergency_contact_1_name)} />
                    <Field label="Relationship" value={display(details.emergency_contact_1_relationship)} />
                    <Field label="Phone" value={display(details.emergency_contact_1_phone)} />
                    <Field label="Alternate phone" value={display(details.emergency_contact_1_alt_phone)} />
                    <Field label="Address" value={display(details.emergency_contact_1_address)} />
                  </div>
                  <div className="rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-4 space-y-2">
                    <div className="text-xs font-semibold uppercase text-[#64748b]">Emergency contact 2</div>
                    <Field label="Name" value={display(details.emergency_contact_2_name)} />
                    <Field label="Relationship" value={display(details.emergency_contact_2_relationship)} />
                    <Field label="Phone" value={display(details.emergency_contact_2_phone)} />
                    <Field label="Alternate phone" value={display(details.emergency_contact_2_alt_phone)} />
                    <Field label="Address" value={display(details.emergency_contact_2_address)} />
                  </div>
                </div>
              </div>

              {/* E Skills & Professional */}
              <div className="space-y-3">
                <SectionTitle letter="E" title="Skills & Professional" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">Skills</div>
                    <div className="mt-2">
                      <Chips items={details.skills} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">Tools known</div>
                    <div className="mt-2">
                      <Chips items={details.tools_known} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">Certifications</div>
                    <div className="mt-2">
                      <Chips items={details.certifications} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">Languages</div>
                    <div className="mt-2">
                      <Chips items={details.languages_known} />
                    </div>
                  </div>
                  <Field
                    label="Years of experience"
                    value={details.years_of_experience != null ? String(details.years_of_experience) : "—"}
                  />
                  <Field label="Previous company" value={display(details.previous_company)} />
                  <Field label="Portfolio" value={<LinkValue href={details.portfolio_url} />} />
                  <Field label="LinkedIn" value={<LinkValue href={details.linkedin_url} />} />
                  <Field label="GitHub" value={<LinkValue href={details.github_url} />} />
                  <Field label="Behance / Dribbble" value={<LinkValue href={details.behance_url} />} />
                  <Field label="Website" value={<LinkValue href={details.website_url} />} />
                </div>
              </div>

              {/* F Bank & Compliance */}
              <div className="space-y-3">
                <SectionTitle letter="F" title="Bank & Compliance" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bank name" value={display(details.bank_name)} />
                  <Field label="Account holder" value={display(details.account_holder_name)} />
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">Account number</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-[#0f172a] font-mono">
                        {revealSensitive.account ? display(details.account_number) : maskAccount(details.account_number)}
                      </div>
                      {details.account_number ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-[#2563eb] hover:underline"
                          onClick={() => setRevealSensitive((s) => ({ ...s, account: !s.account }))}
                        >
                          {revealSensitive.account ? "Hide" : "Show"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <Field label="IFSC" value={display(details.ifsc_code)} />
                  <Field label="Branch" value={display(details.branch_name)} />
                  <Field label="UPI ID" value={display(details.upi_id)} />
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">PAN</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-[#0f172a] font-mono">
                        {revealSensitive.pan ? display(details.pan_number) : maskPan(details.pan_number)}
                      </div>
                      {details.pan_number ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-[#2563eb] hover:underline"
                          onClick={() => setRevealSensitive((s) => ({ ...s, pan: !s.pan }))}
                        >
                          {revealSensitive.pan ? "Hide" : "Show"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3">
                    <div className="text-xs font-medium text-[#94a3b8]">Aadhaar</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-[#0f172a] font-mono">
                        {revealSensitive.aadhaar ? display(details.aadhaar_number) : maskAadhaar(details.aadhaar_number)}
                      </div>
                      {details.aadhaar_number ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-[#2563eb] hover:underline"
                          onClick={() => setRevealSensitive((s) => ({ ...s, aadhaar: !s.aadhaar }))}
                        >
                          {revealSensitive.aadhaar ? "Hide" : "Show"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <Field label="Passport" value={display(details.passport_number)} />
                </div>
              </div>

              {/* G Documents */}
              <div className="space-y-3">
                <SectionTitle letter="G" title="Documents" />
                <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Uploaded</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8edf5]">
                      {documents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-[#64748b]">
                            No documents uploaded.
                          </td>
                        </tr>
                      ) : (
                        documents.map((doc) => {
                          const busy = docBusyId === doc.id;
                          const verified = doc.verification_status === "Verified";
                          return (
                            <tr key={doc.id}>
                              <td className="px-3 py-2 text-[#334155]">{doc.document_type}</td>
                              <td className="px-3 py-2 font-medium text-[#0f172a]">
                                {doc.document_name}
                                {doc.rejection_reason ? (
                                  <div className="mt-0.5 block text-xs font-normal text-rose-600">
                                    {doc.rejection_reason}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">
                                <div
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${verificationBadgeClass(doc.verification_status)}`}
                                >
                                  {doc.verification_status}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-[#64748b]">{formatDateTimeIST(doc.created_at)}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-[#cfdceb] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#f8fbff]"
                                    onClick={() => void viewDocument(doc)}
                                  >
                                    View
                                  </button>
                                  {!verified ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                      onClick={() => void verifyDocument(doc.id)}
                                    >
                                      {busy ? "…" : "Verify"}
                                    </button>
                                  ) : null}
                                  {doc.verification_status !== "Rejected" ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                      onClick={() => void rejectDocument(doc)}
                                    >
                                      Reject
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* H Preferences */}
              <div className="space-y-3">
                <SectionTitle letter="H" title="Preferences" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Preferred work mode" value={display(details.preferred_work_mode)} />
                  <Field label="Communication channel" value={display(details.preferred_communication_channel)} />
                  <Field label="Preferred language" value={display(details.preferred_language)} />
                  <div className="rounded-xl border border-[#e8edf5] bg-white p-3 sm:col-span-2">
                    <div className="text-xs font-medium text-[#94a3b8]">Notification preferences</div>
                    <div className="mt-2">
                      {notifEntries.length ? <Chips items={notifEntries.map(([k]) => k.replace(/_/g, " "))} /> : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
