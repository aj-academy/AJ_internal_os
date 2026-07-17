"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateProfileCompletion,
  DOCUMENT_TYPES,
  emptyProfileDetails,
  mapRowToProfileDetails,
  maskAadhaar,
  maskAccount,
  maskPan,
  PROFILE_DETAIL_SELECT,
  PROFILE_TABS,
  profileDetailsToDbPayload,
  type EmployeeDocumentRow,
  type EmployeeProfileDetails,
  type ProfileTabId,
} from "@/lib/employeeProfile";
import { TagInput } from "./TagInput";
import { PushDeviceSettings } from "@/components/push/PushDeviceSettings";

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

const fieldClass =
  "h-10 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-[#0f172a]";

const NOTIFICATION_KEYS = [
  { key: "email_alerts", label: "Email alerts" },
  { key: "task_updates", label: "Task updates" },
  { key: "leave_updates", label: "Leave updates" },
  { key: "announcements", label: "Company announcements" },
] as const;

const COMPLETION_HINTS: { tab: ProfileTabId; label: string; check: (d: EmployeeProfileDetails) => boolean }[] = [
  { tab: "personal", label: "Add profile photo & personal info", check: (d) => Boolean(d.profile_photo_url && d.preferred_name) },
  { tab: "contact", label: "Complete contact & address", check: (d) => Boolean(d.personal_mobile && d.current_address_line1) },
  { tab: "emergency", label: "Add emergency contact", check: (d) => Boolean(d.emergency_contact_1_name && d.emergency_contact_1_phone) },
  { tab: "skills", label: "Add skills & languages", check: (d) => d.skills.length > 0 && d.languages_known.length > 0 },
  { tab: "bank", label: "Add bank & tax details", check: (d) => Boolean(d.bank_name && d.account_number && d.pan_number) },
  { tab: "preferences", label: "Set work preferences", check: (d) => Boolean(d.preferred_work_mode && d.preferred_language) },
];

function isMissingProfileSchema(msg: string) {
  const m = msg.toLowerCase();
  return (
    (m.includes("employee_profile_details") || m.includes("employee_documents")) &&
    (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))
  );
}

function formatDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function applySameAsCurrent(d: EmployeeProfileDetails): EmployeeProfileDetails {
  if (!d.same_as_current) return d;
  return {
    ...d,
    permanent_address_line1: d.current_address_line1,
    permanent_address_line2: d.current_address_line2,
    permanent_city: d.current_city,
    permanent_state: d.current_state,
    permanent_pincode: d.current_pincode,
    permanent_country: d.current_country,
  };
}

function verificationBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Verified
      </span>
    );
  }
  if (s === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
        <XCircle className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}

function AdminBadge() {
  return (
    <span className="ml-2 inline-flex rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1d4ed8] ring-1 ring-[#bfdbfe]">
      Managed by Admin
    </span>
  );
}

function LabeledField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[#334155]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[#94a3b8]">{hint}</span> : null}
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e8edf5] bg-[#fbfdff] p-4">
      <div className="flex flex-wrap items-center text-xs font-medium text-[#94a3b8]">
        {label}
        <AdminBadge />
      </div>
      <p className="mt-1.5 font-semibold text-[#0f172a]">{value || "—"}</p>
    </div>
  );
}

function SaveBar({
  saving,
  disabled,
  onSave,
}: {
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e8edf5] pt-4">
      <Button
        type="button"
        disabled={disabled || saving}
        onClick={onSave}
        className="h-10 rounded-full bg-[#2563eb] px-6 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save changes"
        )}
      </Button>
    </div>
  );
}

export function EmployeeProfileWorkbench() {
  const supabase = useMemo(() => createClient(), []);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetailsRow | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabId>("overview");
  const [details, setDetails] = useState<EmployeeProfileDetails | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [docType, setDocType] = useState<string>(DOCUMENT_TYPES[0]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const patch = useCallback((partial: Partial<EmployeeProfileDetails>) => {
    setDetails((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setProfile(null);
        setDetails(null);
        setDocuments([]);
        return;
      }

      const [profRes, edRes, epdRes, docsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,role,department,designation,status,created_at")
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("employee_details")
          .select("employee_code,phone,joined_at,manager_id,employment_type")
          .eq("employee_id", uid)
          .maybeSingle(),
        supabase.from("employee_profile_details").select(PROFILE_DETAIL_SELECT).eq("profile_id", uid).maybeSingle(),
        supabase
          .from("employee_documents")
          .select("*")
          .eq("profile_id", uid)
          .order("created_at", { ascending: false }),
      ]);

      if (profRes.error) throw new Error(profRes.error.message);
      setProfile((profRes.data as ProfileRow | null) ?? null);

      const ed = (edRes.data as EmployeeDetailsRow | null) ?? null;
      setEmployeeDetails(ed);
      if (ed?.manager_id) {
        const { data: mgr } = await supabase.from("profiles").select("full_name,email").eq("id", ed.manager_id).maybeSingle();
        setManagerName((mgr?.full_name as string | null) ?? null);
        setManagerEmail((mgr?.email as string | null) ?? null);
      } else {
        setManagerName(null);
        setManagerEmail(null);
      }

      if (epdRes.error) {
        if (isMissingProfileSchema(epdRes.error.message)) {
          setSchemaMissing(true);
          setDetails(emptyProfileDetails(uid));
        } else {
          throw new Error(epdRes.error.message);
        }
      } else {
        setSchemaMissing(false);
        if (epdRes.data) {
          const mapped = mapRowToProfileDetails(epdRes.data as Record<string, unknown>, uid);
          setDetails(mapped);
          setPhotoPreview(mapped.profile_photo_url);
        } else {
          setDetails(emptyProfileDetails(uid));
          setPhotoPreview(null);
        }
      }

      if (docsRes.error) {
        if (isMissingProfileSchema(docsRes.error.message)) {
          setSchemaMissing(true);
          setDocuments([]);
        } else {
          throw new Error(docsRes.error.message);
        }
      } else {
        setDocuments((docsRes.data ?? []) as EmployeeDocumentRow[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const completion = useMemo(() => {
    if (!details) return 0;
    return calculateProfileCompletion(details);
  }, [details]);

  const saveProfile = useCallback(async () => {
    if (!userId || !details || schemaMissing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const prepared = applySameAsCurrent(details);
      const payload = profileDetailsToDbPayload(prepared, userId);
      const { id: _rowId, ...dbRow } = payload;
      const { error: upsertError } = await supabase.from("employee_profile_details").upsert(
        { ...dbRow, profile_id: userId },
        { onConflict: "profile_id" },
      );
      if (upsertError) {
        if (isMissingProfileSchema(upsertError.message)) {
          setSchemaMissing(true);
          setError("Run BB_internal_SB/employee_profile_self_service_schema.sql in Supabase, then refresh.");
          return;
        }
        throw new Error(upsertError.message);
      }
      setDetails({ ...prepared, profile_completion: payload.profile_completion });
      setSuccess("Profile saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }, [details, schemaMissing, supabase, userId]);

  const uploadToStorage = useCallback(
    async (file: File, documentType: string) => {
      if (!userId) throw new Error("Not signed in.");
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${userId}/${documentType}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("employee-documents").upload(storagePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data: signed, error: signError } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      if (signError || !signed?.signedUrl) throw new Error(signError?.message ?? "Could not create document URL.");
      return { storagePath, signedUrl: signed.signedUrl };
    },
    [supabase, userId],
  );

  const handlePhotoUpload = useCallback(
    async (file: File) => {
      if (!userId || !details) return;
      setUploadingPhoto(true);
      setError(null);
      try {
        const { storagePath, signedUrl } = await uploadToStorage(file, "Profile Photo");
        patch({ profile_photo_url: signedUrl });
        setPhotoPreview(signedUrl);
        const prepared = applySameAsCurrent({ ...details, profile_photo_url: signedUrl });
        const payload = profileDetailsToDbPayload(prepared, userId);
        const { id: _rowId, ...dbRow } = payload;
        const { error: upsertError } = await supabase.from("employee_profile_details").upsert(
          { ...dbRow, profile_id: userId },
          { onConflict: "profile_id" },
        );
        if (upsertError) throw new Error(upsertError.message);
        setDetails({ ...prepared, profile_completion: payload.profile_completion });
        setSuccess("Profile photo updated.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Photo upload failed.");
      } finally {
        setUploadingPhoto(false);
      }
    },
    [details, patch, supabase, uploadToStorage, userId],
  );

  const handleDocumentUpload = useCallback(
    async (file: File) => {
      if (!userId) return;
      setUploadingDoc(true);
      setError(null);
      try {
        const { storagePath, signedUrl } = await uploadToStorage(file, docType);
        const { error: insertError } = await supabase.from("employee_documents").insert({
          profile_id: userId,
          document_type: docType,
          document_name: file.name,
          document_url: signedUrl,
          storage_path: storagePath,
          verification_status: "Pending",
          uploaded_by: userId,
        });
        if (insertError) {
          if (isMissingProfileSchema(insertError.message)) {
            setSchemaMissing(true);
            setError("Run BB_internal_SB/employee_profile_self_service_schema.sql in Supabase, then refresh.");
            return;
          }
          throw new Error(insertError.message);
        }
        setSuccess("Document uploaded.");
        const { data } = await supabase
          .from("employee_documents")
          .select("*")
          .eq("profile_id", userId)
          .order("created_at", { ascending: false });
        setDocuments((data ?? []) as EmployeeDocumentRow[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Document upload failed.");
      } finally {
        setUploadingDoc(false);
        if (docRef.current) docRef.current.value = "";
      }
    },
    [docType, supabase, uploadToStorage, userId],
  );

  const displayName = details?.preferred_name?.trim() || profile?.full_name || "Employee";
  const initials = (displayName || "E")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-[#d4deea] bg-white p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  return (
    <section className="space-y-5 rounded-[24px] border border-[#d4deea] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8edf5] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Self-service</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#0f172a]">My profile</h2>
          <p className="mt-1 text-sm text-[#64748b]">Update your personal information, documents, and preferences.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full border-[#cfdceb]"
          disabled={loading}
          onClick={() => void loadAll()}
        >
          Reload
        </Button>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#eff6ff] px-4 py-3 text-sm text-blue-900">
          Run <strong>BB_internal_SB/employee_profile_self_service_schema.sql</strong> in Supabase, then refresh this page.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-[#eaf1ff]"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!details ? (
        <div className="rounded-[20px] border border-dashed border-[#cfdceb] bg-[#f8fbff] p-8 text-center text-sm text-[#64748b]">
          Sign in to manage your profile.
        </div>
      ) : null}

      {details && activeTab === "overview" ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex min-w-0 flex-1 gap-4 rounded-[20px] border border-[#dbe6f3] bg-gradient-to-br from-[#f8fbff] to-white p-5 shadow-sm">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-[#dbe6f3]" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold text-[#2563eb] ring-2 ring-[#dbe6f3]">
                  {initials}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-semibold text-[#0f172a]">{displayName}</h3>
                <p className="mt-1 text-sm text-[#64748b]">{profile?.email ?? "—"}</p>
                <p className="mt-1 text-sm text-[#475569]">
                  {[profile?.designation, profile?.department].filter(Boolean).join(" · ") || "—"}
                </p>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-[#64748b]">
                    <span>Profile completion</span>
                    <span className="text-[#2563eb]">{completion}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                    <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 lg:w-72">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Quick links</p>
              <ul className="mt-3 space-y-2">
                {COMPLETION_HINTS.map((hint) => (
                  <li key={hint.tab}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(hint.tab)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-[#334155] hover:bg-[#f8fbff]"
                    >
                      <span>{hint.label}</span>
                      {hint.check(details) ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="text-xs text-[#2563eb]">Edit</span>
                      )}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveTab("documents")}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-[#334155] hover:bg-[#f8fbff]"
                  >
                    <span>Upload documents</span>
                    <FileText className="h-4 w-4 text-[#2563eb]" />
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-[20px] border border-[#dbe6f3] bg-[#fbfdff] p-5">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <User className="h-4 w-4 text-[#2563eb]" />
              HR record (read-only)
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ReadonlyField label="Legal name" value={profile?.full_name ?? ""} />
              <ReadonlyField label="Work email" value={profile?.email ?? ""} />
              <ReadonlyField label="Employee code" value={employeeDetails?.employee_code ?? ""} />
              <ReadonlyField label="Department" value={profile?.department ?? ""} />
              <ReadonlyField label="Designation" value={profile?.designation ?? ""} />
              <ReadonlyField label="Employment type" value={employeeDetails?.employment_type ?? ""} />
              <ReadonlyField label="Work phone" value={employeeDetails?.phone ?? ""} />
              <ReadonlyField label="Joined company" value={formatDateOnly(employeeDetails?.joined_at)} />
              <ReadonlyField label="Employment status" value={profile?.status ?? ""} />
              <ReadonlyField label="Portal role" value={profile?.role ?? ""} />
              <ReadonlyField
                label="Reporting manager"
                value={[managerName, managerEmail].filter(Boolean).join(" · ")}
              />
              <ReadonlyField label="Record since" value={formatDateOnly(profile?.created_at)} />
            </div>
          </div>

          {!details.id && !schemaMissing ? (
            <div className="rounded-xl border border-dashed border-[#cfdceb] bg-[#f8fbff] px-4 py-3 text-sm text-[#64748b]">
              You have not saved profile details yet. Use the tabs above to complete your information.
            </div>
          ) : null}
        </div>
      ) : null}

      {details && activeTab === "personal" ? (
        <div className="space-y-5 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          <div className="flex flex-wrap items-center gap-4 border-b border-[#e8edf5] pb-5">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-[#dbe6f3]" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eff6ff] text-lg font-semibold text-[#2563eb]">
                {initials}
              </span>
            )}
            <div>
              <p className="text-sm font-medium text-[#334155]">Profile photo</p>
              <p className="text-xs text-[#94a3b8]">JPEG, PNG or WebP · max 10 MB</p>
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePhotoUpload(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-9 rounded-full border-[#cfdceb]"
                disabled={uploadingPhoto || schemaMissing}
                onClick={() => photoRef.current?.click()}
              >
                {uploadingPhoto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload photo
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Preferred name">
              <Input
                value={details.preferred_name ?? ""}
                onChange={(e) => patch({ preferred_name: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Date of birth">
              <input
                type="date"
                value={details.date_of_birth ?? ""}
                onChange={(e) => patch({ date_of_birth: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Gender">
              <select
                value={details.gender ?? ""}
                onChange={(e) => patch({ gender: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              >
                <option value="">Select</option>
                {["Male", "Female", "Non-binary", "Prefer not to say"].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </LabeledField>
            <LabeledField label="Blood group">
              <Input
                value={details.blood_group ?? ""}
                onChange={(e) => patch({ blood_group: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Marital status">
              <select
                value={details.marital_status ?? ""}
                onChange={(e) => patch({ marital_status: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              >
                <option value="">Select</option>
                {["Single", "Married", "Divorced", "Widowed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </LabeledField>
            <LabeledField label="Nationality">
              <Input
                value={details.nationality ?? ""}
                onChange={(e) => patch({ nationality: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Personal email">
              <Input
                type="email"
                value={details.personal_email ?? ""}
                onChange={(e) => patch({ personal_email: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <div className="sm:col-span-2">
              <LabeledField label="Bio">
                <textarea
                  value={details.bio ?? ""}
                  onChange={(e) => patch({ bio: e.target.value || null })}
                  rows={3}
                  className="w-full rounded-xl border border-[#cfdceb] bg-white px-3 py-2 text-sm"
                  disabled={schemaMissing}
                />
              </LabeledField>
            </div>
          </div>
          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {details && activeTab === "contact" ? (
        <div className="space-y-5 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Personal mobile">
              <Input
                value={details.personal_mobile ?? ""}
                onChange={(e) => patch({ personal_mobile: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Alternate mobile">
              <Input
                value={details.alternate_mobile ?? ""}
                onChange={(e) => patch({ alternate_mobile: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
          </div>

          <p className="text-sm font-semibold text-[#0f172a]">Current address</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <LabeledField label="Address line 1">
                <Input
                  value={details.current_address_line1 ?? ""}
                  onChange={(e) => patch({ current_address_line1: e.target.value || null })}
                  className={fieldClass}
                  disabled={schemaMissing}
                />
              </LabeledField>
            </div>
            <div className="sm:col-span-2">
              <LabeledField label="Address line 2">
                <Input
                  value={details.current_address_line2 ?? ""}
                  onChange={(e) => patch({ current_address_line2: e.target.value || null })}
                  className={fieldClass}
                  disabled={schemaMissing}
                />
              </LabeledField>
            </div>
            <LabeledField label="City">
              <Input
                value={details.current_city ?? ""}
                onChange={(e) => patch({ current_city: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="State">
              <Input
                value={details.current_state ?? ""}
                onChange={(e) => patch({ current_state: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="PIN / ZIP">
              <Input
                value={details.current_pincode ?? ""}
                onChange={(e) => patch({ current_pincode: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Country">
              <Input
                value={details.current_country ?? ""}
                onChange={(e) => patch({ current_country: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#334155]">
            <input
              type="checkbox"
              checked={details.same_as_current}
              onChange={(e) => patch({ same_as_current: e.target.checked })}
              disabled={schemaMissing}
              className="rounded border-[#cfdceb]"
            />
            Permanent address same as current (applied when you save)
          </label>

          {!details.same_as_current ? (
            <>
              <p className="text-sm font-semibold text-[#0f172a]">Permanent address</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <LabeledField label="Address line 1">
                    <Input
                      value={details.permanent_address_line1 ?? ""}
                      onChange={(e) => patch({ permanent_address_line1: e.target.value || null })}
                      className={fieldClass}
                      disabled={schemaMissing}
                    />
                  </LabeledField>
                </div>
                <div className="sm:col-span-2">
                  <LabeledField label="Address line 2">
                    <Input
                      value={details.permanent_address_line2 ?? ""}
                      onChange={(e) => patch({ permanent_address_line2: e.target.value || null })}
                      className={fieldClass}
                      disabled={schemaMissing}
                    />
                  </LabeledField>
                </div>
                <LabeledField label="City">
                  <Input
                    value={details.permanent_city ?? ""}
                    onChange={(e) => patch({ permanent_city: e.target.value || null })}
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <LabeledField label="State">
                  <Input
                    value={details.permanent_state ?? ""}
                    onChange={(e) => patch({ permanent_state: e.target.value || null })}
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <LabeledField label="PIN / ZIP">
                  <Input
                    value={details.permanent_pincode ?? ""}
                    onChange={(e) => patch({ permanent_pincode: e.target.value || null })}
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <LabeledField label="Country">
                  <Input
                    value={details.permanent_country ?? ""}
                    onChange={(e) => patch({ permanent_country: e.target.value || null })}
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
              </div>
            </>
          ) : null}

          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {details && activeTab === "emergency" ? (
        <div className="space-y-6 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          {([1, 2] as const).map((n) => (
            <div key={n} className="space-y-4 border-b border-[#f1f5f9] pb-6 last:border-0 last:pb-0">
              <p className="text-sm font-semibold text-[#0f172a]">Emergency contact {n}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledField label="Name">
                  <Input
                    value={(n === 1 ? details.emergency_contact_1_name : details.emergency_contact_2_name) ?? ""}
                    onChange={(e) =>
                      patch(n === 1 ? { emergency_contact_1_name: e.target.value || null } : { emergency_contact_2_name: e.target.value || null })
                    }
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <LabeledField label="Relationship">
                  <Input
                    value={(n === 1 ? details.emergency_contact_1_relationship : details.emergency_contact_2_relationship) ?? ""}
                    onChange={(e) =>
                      patch(
                        n === 1
                          ? { emergency_contact_1_relationship: e.target.value || null }
                          : { emergency_contact_2_relationship: e.target.value || null },
                      )
                    }
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <LabeledField label="Phone">
                  <Input
                    value={(n === 1 ? details.emergency_contact_1_phone : details.emergency_contact_2_phone) ?? ""}
                    onChange={(e) =>
                      patch(n === 1 ? { emergency_contact_1_phone: e.target.value || null } : { emergency_contact_2_phone: e.target.value || null })
                    }
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <LabeledField label="Alternate phone">
                  <Input
                    value={(n === 1 ? details.emergency_contact_1_alt_phone : details.emergency_contact_2_alt_phone) ?? ""}
                    onChange={(e) =>
                      patch(
                        n === 1
                          ? { emergency_contact_1_alt_phone: e.target.value || null }
                          : { emergency_contact_2_alt_phone: e.target.value || null },
                      )
                    }
                    className={fieldClass}
                    disabled={schemaMissing}
                  />
                </LabeledField>
                <div className="sm:col-span-2">
                  <LabeledField label="Address">
                    <textarea
                      value={(n === 1 ? details.emergency_contact_1_address : details.emergency_contact_2_address) ?? ""}
                      onChange={(e) =>
                        patch(
                          n === 1
                            ? { emergency_contact_1_address: e.target.value || null }
                            : { emergency_contact_2_address: e.target.value || null },
                        )
                      }
                      rows={2}
                      className="w-full rounded-xl border border-[#cfdceb] bg-white px-3 py-2 text-sm"
                      disabled={schemaMissing}
                    />
                  </LabeledField>
                </div>
              </div>
            </div>
          ))}
          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {details && activeTab === "skills" ? (
        <div className="space-y-5 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <LabeledField label="Skills">
              <TagInput tags={details.skills} onChange={(skills) => patch({ skills })} disabled={schemaMissing} placeholder="e.g. React, SQL" />
            </LabeledField>
            <LabeledField label="Tools known">
              <TagInput tags={details.tools_known} onChange={(tools_known) => patch({ tools_known })} disabled={schemaMissing} placeholder="e.g. Figma, Jira" />
            </LabeledField>
            <LabeledField label="Languages">
              <TagInput tags={details.languages_known} onChange={(languages_known) => patch({ languages_known })} disabled={schemaMissing} placeholder="e.g. English, Hindi" />
            </LabeledField>
            <LabeledField label="Certifications">
              <TagInput tags={details.certifications} onChange={(certifications) => patch({ certifications })} disabled={schemaMissing} placeholder="Press Enter to add" />
            </LabeledField>
            <LabeledField label="Years of experience">
              <Input
                type="number"
                min={0}
                value={details.years_of_experience ?? ""}
                onChange={(e) => patch({ years_of_experience: e.target.value ? Number(e.target.value) : null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Previous company">
              <Input
                value={details.previous_company ?? ""}
                onChange={(e) => patch({ previous_company: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
            <LabeledField label="Portfolio URL">
              <Input value={details.portfolio_url ?? ""} onChange={(e) => patch({ portfolio_url: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="LinkedIn">
              <Input value={details.linkedin_url ?? ""} onChange={(e) => patch({ linkedin_url: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="GitHub">
              <Input value={details.github_url ?? ""} onChange={(e) => patch({ github_url: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Behance">
              <Input value={details.behance_url ?? ""} onChange={(e) => patch({ behance_url: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Website">
              <Input value={details.website_url ?? ""} onChange={(e) => patch({ website_url: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
          </div>
          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {details && activeTab === "bank" ? (
        <div className="space-y-5 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[#64748b]">Sensitive fields are masked by default.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-[#cfdceb]"
              onClick={() => setRevealSensitive((v) => !v)}
            >
              {revealSensitive ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
              {revealSensitive ? "Hide" : "Show"}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Bank name">
              <Input value={details.bank_name ?? ""} onChange={(e) => patch({ bank_name: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Account holder name">
              <Input value={details.account_holder_name ?? ""} onChange={(e) => patch({ account_holder_name: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Account number">
              {revealSensitive ? (
                <Input value={details.account_number ?? ""} onChange={(e) => patch({ account_number: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
              ) : (
                <p className={fieldClass + " flex items-center bg-[#f8fbff] font-mono text-[#475569]"}>{maskAccount(details.account_number)}</p>
              )}
            </LabeledField>
            <LabeledField label="IFSC code">
              <Input value={details.ifsc_code ?? ""} onChange={(e) => patch({ ifsc_code: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Branch name">
              <Input value={details.branch_name ?? ""} onChange={(e) => patch({ branch_name: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="UPI ID">
              <Input value={details.upi_id ?? ""} onChange={(e) => patch({ upi_id: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="PAN">
              {revealSensitive ? (
                <Input value={details.pan_number ?? ""} onChange={(e) => patch({ pan_number: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
              ) : (
                <p className={fieldClass + " flex items-center bg-[#f8fbff] font-mono text-[#475569]"}>{maskPan(details.pan_number)}</p>
              )}
            </LabeledField>
            <LabeledField label="Aadhaar">
              {revealSensitive ? (
                <Input value={details.aadhaar_number ?? ""} onChange={(e) => patch({ aadhaar_number: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
              ) : (
                <p className={fieldClass + " flex items-center bg-[#f8fbff] font-mono text-[#475569]"}>{maskAadhaar(details.aadhaar_number)}</p>
              )}
            </LabeledField>
            <LabeledField label="Passport number">
              <Input value={details.passport_number ?? ""} onChange={(e) => patch({ passport_number: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
          </div>
          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {details && activeTab === "documents" ? (
        <div className="space-y-5 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#e8edf5] bg-[#f8fbff] p-4">
            <LabeledField label="Document type">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className={fieldClass} disabled={schemaMissing}>
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </LabeledField>
            <input
              ref={docRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleDocumentUpload(f);
              }}
            />
            <Button
              type="button"
              className="h-10 rounded-full bg-[#2563eb] px-5 text-white hover:bg-[#1d4ed8]"
              disabled={uploadingDoc || schemaMissing}
              onClick={() => docRef.current?.click()}
            >
              {uploadingDoc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload document
            </Button>
          </div>

          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#cfdceb] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#64748b]">
              No documents uploaded yet. Upload ID proofs, resume, or certificates above.
            </div>
          ) : (
            <ul className="divide-y divide-[#e8edf5] rounded-xl border border-[#e8edf5]">
              {documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[#0f172a]">{doc.document_name}</p>
                    <p className="text-xs text-[#64748b]">
                      {doc.document_type} · {formatDateOnly(doc.created_at)}
                    </p>
                    {doc.rejection_reason ? (
                      <p className="mt-1 text-xs text-rose-600">Reason: {doc.rejection_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {verificationBadge(doc.verification_status)}
                    <a
                      href={doc.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[#2563eb] hover:underline"
                    >
                      View
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {details && activeTab === "preferences" ? (
        <div className="space-y-5 rounded-[20px] border border-[#dbe6f3] bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Preferred work mode">
              <select
                value={details.preferred_work_mode ?? ""}
                onChange={(e) => patch({ preferred_work_mode: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              >
                <option value="">Select</option>
                {["Office", "Remote", "Hybrid"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </LabeledField>
            <LabeledField label="Preferred communication">
              <select
                value={details.preferred_communication_channel ?? ""}
                onChange={(e) => patch({ preferred_communication_channel: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              >
                <option value="">Select</option>
                {["Email", "Phone", "WhatsApp", "Slack"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </LabeledField>
            <LabeledField label="Preferred language">
              <Input
                value={details.preferred_language ?? ""}
                onChange={(e) => patch({ preferred_language: e.target.value || null })}
                className={fieldClass}
                disabled={schemaMissing}
              />
            </LabeledField>
          </div>

          <p className="text-sm font-semibold text-[#0f172a]">Notification preferences</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {NOTIFICATION_KEYS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-[#e8edf5] bg-[#fbfdff] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(details.notification_preferences[key])}
                  onChange={(e) =>
                    patch({
                      notification_preferences: {
                        ...details.notification_preferences,
                        [key]: e.target.checked,
                      },
                    })
                  }
                  disabled={schemaMissing}
                  className="rounded border-[#cfdceb]"
                />
                {label}
              </label>
            ))}
          </div>
          <PushDeviceSettings />
          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}
    </section>
  );
}
