"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Upload,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  emptyProfileDetails,
  mapRowToProfileDetails,
  PROFILE_DETAIL_SELECT,
  profileDetailsToDbPayload,
  type EmployeeDocumentRow,
  type EmployeeProfileDetails,
} from "@/lib/employeeProfile";
import { PushDeviceSettings } from "@/components/push/PushDeviceSettings";

/* ── helpers ── */

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  designation: string | null;
  status: string | null;
  created_at: string | null;
  course?: string | null;
  assigned_mentor_id?: string | null;
};

const STUDENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal Info" },
  { id: "contact", label: "Contact & Address" },
  { id: "documents", label: "Documents" },
] as const;

type StudentTabId = (typeof STUDENT_TABS)[number]["id"];

const STUDENT_DOC_TYPES = [
  "Profile Photo",
  "Aadhaar",
  "Resume",
  "Education Certificate",
  "Other Document",
] as const;

const fieldClass =
  "h-10 w-full rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-[#3d3428]";

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

function LabeledField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[#3d3428]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[#6b5d4d]">{hint}</span> : null}
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#f0e6d4] bg-[#fefcf8] p-4">
      <div className="text-xs font-medium text-[#6b5d4d]">{label}</div>
      <p className="mt-1.5 font-semibold text-[#3d3428]">{value || "—"}</p>
    </div>
  );
}

function SaveBar({ saving, disabled, onSave }: { saving: boolean; disabled?: boolean; onSave: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#f0e6d4] pt-4">
      <Button
        type="button"
        disabled={disabled || saving}
        onClick={onSave}
        className="h-10 rounded-full bg-[#c9a227] px-6 text-sm font-semibold text-white hover:bg-[#b8921f]"
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

function verificationBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (s === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

/* ── main component ── */

export default function StudentProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [mentorName, setMentorName] = useState<string | null>(null);
  const [details, setDetails] = useState<EmployeeProfileDetails | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<StudentTabId>("overview");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState<string>(STUDENT_DOC_TYPES[0]);

  const initials = useMemo(() => {
    const n = profile?.full_name ?? "";
    return n
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }, [profile?.full_name]);

  const patch = useCallback((updates: Partial<EmployeeProfileDetails>) => {
    setDetails((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setProfile(null); setDetails(null); setDocuments([]); return; }

      const [profRes, epdRes, docsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,role,department,designation,status,created_at,course,assigned_mentor_id")
          .eq("id", uid)
          .maybeSingle(),
        supabase.from("employee_profile_details").select(PROFILE_DETAIL_SELECT).eq("profile_id", uid).maybeSingle(),
        supabase.from("employee_documents").select("*").eq("profile_id", uid).order("created_at", { ascending: false }),
      ]);

      if (profRes.error) throw new Error(profRes.error.message);
      const prof = (profRes.data as ProfileRow | null) ?? null;
      setProfile(prof);

      if (prof?.assigned_mentor_id) {
        const { data: mgr } = await supabase.from("profiles").select("full_name").eq("id", prof.assigned_mentor_id).maybeSingle();
        setMentorName((mgr?.full_name as string | null) ?? null);
      } else {
        setMentorName(null);
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
          setSchemaMissing(true); setDocuments([]);
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

  useEffect(() => { void loadAll(); }, [loadAll]);

  const saveProfile = async () => {
    if (!details || !userId || schemaMissing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = profileDetailsToDbPayload(details, userId);
      if (details.id) {
        const { error: e } = await supabase.from("employee_profile_details").update(payload).eq("id", details.id);
        if (e) throw new Error(e.message);
      } else {
        const { data, error: e } = await supabase.from("employee_profile_details").insert({ ...payload, profile_id: userId }).select("id").single();
        if (e) throw new Error(e.message);
        if (data) patch({ id: (data as { id: string }).id });
      }
      setSuccess("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!userId) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `profile-photos/${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("employee-documents").upload(path, file, { upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(path);
      const url = urlData?.publicUrl ?? "";
      patch({ profile_photo_url: url });
      setPhotoPreview(url);
      setSuccess("Photo uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDocUpload = async (file: File) => {
    if (!userId) return;
    setUploadingDoc(true);
    try {
      const path = `documents/${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("employee-documents").upload(path, file);
      if (uploadError) throw new Error(uploadError.message);
      const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(path);
      const url = urlData?.publicUrl ?? "";
      const { error: insertError } = await supabase.from("employee_documents").insert({
        profile_id: userId,
        document_type: docType,
        document_name: file.name,
        document_url: url,
        storage_path: path,
        verification_status: "pending",
        uploaded_by: userId,
      });
      if (insertError) throw new Error(insertError.message);
      setSuccess("Document uploaded.");
      void loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document upload failed.");
    } finally {
      setUploadingDoc(false);
    }
  };

  if (loading) {
    return (
      <section className="flex items-center gap-2 rounded-[24px] border border-[#e8dcc8] bg-white p-8 text-sm text-[#6b5d4d]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f0e6d4] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b5d4d]">Student</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#3d3428]">My profile</h2>
          <p className="mt-1 text-sm text-[#6b5d4d]">View your student information and upload documents.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full border-[#e8dcc8]"
          disabled={loading}
          onClick={() => void loadAll()}
        >
          Reload
        </Button>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-200 bg-[#faf3e3] px-4 py-3 text-sm text-amber-900">
          Profile details table is not set up yet. Ask your admin to run the profile schema SQL.
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

      {/* Tab bar */}
      <div className="overflow-x-auto rounded-2xl border border-[#f0e6d4] bg-[#faf3e3] p-2">
        <div className="flex min-w-max gap-2">
          {STUDENT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "rounded-xl bg-[#c9a227] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#6b5d4d] hover:bg-[#faf3e3]"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!details ? (
        <div className="rounded-[20px] border border-dashed border-[#e8dcc8] bg-[#faf3e3] p-8 text-center text-sm text-[#6b5d4d]">
          Sign in to manage your profile.
        </div>
      ) : null}

      {/* ── Overview ── */}
      {details && activeTab === "overview" ? (
        <div className="space-y-5">
          <div className="flex min-w-0 gap-4 rounded-[20px] border border-[#f0e6d4] bg-gradient-to-br from-[#fefcf8] to-white p-5 shadow-sm">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-[#f0e6d4]" />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#faf3e3] text-xl font-semibold text-[#c9a227] ring-2 ring-[#f0e6d4]">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-semibold text-[#3d3428]">{profile?.full_name ?? "—"}</h3>
              <p className="mt-1 text-sm text-[#6b5d4d]">{profile?.email ?? "—"}</p>
              <p className="mt-1 text-sm text-[#6b5d4d]">
                {[profile?.course, profile?.department].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </div>

          <div className="rounded-[20px] border border-[#f0e6d4] bg-[#fefcf8] p-5">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#3d3428]">
              <User className="h-4 w-4 text-[#c9a227]" />
              Student record
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ReadonlyField label="Full name" value={profile?.full_name ?? ""} />
              <ReadonlyField label="Email" value={profile?.email ?? ""} />
              <ReadonlyField label="Course" value={(profile?.course as string) ?? ""} />
              <ReadonlyField label="Department / Batch" value={profile?.department ?? ""} />
              <ReadonlyField label="Mentor" value={mentorName ?? "Not assigned"} />
              <ReadonlyField label="Status" value={profile?.status ?? ""} />
              <ReadonlyField label="Member since" value={formatDateOnly(profile?.created_at)} />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Personal Info ── */}
      {details && activeTab === "personal" ? (
        <div className="space-y-5 rounded-[20px] border border-[#f0e6d4] bg-white p-5">
          <div className="flex flex-wrap items-center gap-4 border-b border-[#f0e6d4] pb-5">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-[#f0e6d4]" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#faf3e3] text-lg font-semibold text-[#c9a227]">
                {initials}
              </span>
            )}
            <div>
              <p className="text-sm font-medium text-[#3d3428]">Profile photo</p>
              <p className="text-xs text-[#6b5d4d]">JPEG, PNG or WebP · max 10 MB</p>
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); }}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-9 rounded-full border-[#e8dcc8]"
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
              <Input value={details.preferred_name ?? ""} onChange={(e) => patch({ preferred_name: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Date of birth">
              <input type="date" value={details.date_of_birth ?? ""} onChange={(e) => patch({ date_of_birth: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Gender">
              <select value={details.gender ?? ""} onChange={(e) => patch({ gender: e.target.value || null })} className={fieldClass} disabled={schemaMissing}>
                <option value="">Select</option>
                {["Male", "Female", "Non-binary", "Prefer not to say"].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </LabeledField>
            <LabeledField label="Blood group">
              <Input value={details.blood_group ?? ""} onChange={(e) => patch({ blood_group: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Nationality">
              <Input value={details.nationality ?? ""} onChange={(e) => patch({ nationality: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Personal email">
              <Input type="email" value={details.personal_email ?? ""} onChange={(e) => patch({ personal_email: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Short bio" hint="A brief intro about yourself.">
              <Input value={details.bio ?? ""} onChange={(e) => patch({ bio: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
          </div>
          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {/* ── Contact & Address ── */}
      {details && activeTab === "contact" ? (
        <div className="space-y-5 rounded-[20px] border border-[#f0e6d4] bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Mobile number">
              <Input value={details.personal_mobile ?? ""} onChange={(e) => patch({ personal_mobile: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Alternate mobile">
              <Input value={details.alternate_mobile ?? ""} onChange={(e) => patch({ alternate_mobile: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
          </div>
          <p className="text-sm font-semibold text-[#3d3428]">Current address</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label="Address line 1">
              <Input value={details.current_address_line1 ?? ""} onChange={(e) => patch({ current_address_line1: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Address line 2">
              <Input value={details.current_address_line2 ?? ""} onChange={(e) => patch({ current_address_line2: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="City">
              <Input value={details.current_city ?? ""} onChange={(e) => patch({ current_city: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="State">
              <Input value={details.current_state ?? ""} onChange={(e) => patch({ current_state: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Pincode">
              <Input value={details.current_pincode ?? ""} onChange={(e) => patch({ current_pincode: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
            <LabeledField label="Country">
              <Input value={details.current_country ?? ""} onChange={(e) => patch({ current_country: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
            </LabeledField>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input
              type="checkbox"
              checked={details.same_as_current}
              onChange={(e) => patch({ same_as_current: e.target.checked })}
              disabled={schemaMissing}
              className="rounded border-[#e8dcc8]"
            />
            Permanent address is the same as current address
          </label>

          {!details.same_as_current ? (
            <>
              <p className="text-sm font-semibold text-[#3d3428]">Permanent address</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledField label="Address line 1">
                  <Input value={details.permanent_address_line1 ?? ""} onChange={(e) => patch({ permanent_address_line1: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
                </LabeledField>
                <LabeledField label="Address line 2">
                  <Input value={details.permanent_address_line2 ?? ""} onChange={(e) => patch({ permanent_address_line2: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
                </LabeledField>
                <LabeledField label="City">
                  <Input value={details.permanent_city ?? ""} onChange={(e) => patch({ permanent_city: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
                </LabeledField>
                <LabeledField label="State">
                  <Input value={details.permanent_state ?? ""} onChange={(e) => patch({ permanent_state: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
                </LabeledField>
                <LabeledField label="Pincode">
                  <Input value={details.permanent_pincode ?? ""} onChange={(e) => patch({ permanent_pincode: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
                </LabeledField>
                <LabeledField label="Country">
                  <Input value={details.permanent_country ?? ""} onChange={(e) => patch({ permanent_country: e.target.value || null })} className={fieldClass} disabled={schemaMissing} />
                </LabeledField>
              </div>
            </>
          ) : null}

          <SaveBar saving={saving} disabled={schemaMissing} onSave={() => void saveProfile()} />
        </div>
      ) : null}

      {/* ── Documents ── */}
      {details && activeTab === "documents" ? (
        <div className="space-y-5 rounded-[20px] border border-[#f0e6d4] bg-white p-5">
          <div className="flex flex-wrap items-end gap-3">
            <LabeledField label="Document type">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className={fieldClass} disabled={schemaMissing}>
                {STUDENT_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </LabeledField>
            <div>
              <input
                ref={docRef}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleDocUpload(f); }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-[#e8dcc8]"
                disabled={uploadingDoc || schemaMissing}
                onClick={() => docRef.current?.click()}
              >
                {uploadingDoc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload document
              </Button>
            </div>
          </div>

          {documents.length ? (
            <ul className="divide-y divide-[#f0e6d4] rounded-xl border border-[#f0e6d4]">
              {documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-[#c9a227]" />
                    <div>
                      <p className="text-sm font-medium text-[#3d3428]">{doc.document_name}</p>
                      <p className="text-xs text-[#6b5d4d]">{doc.document_type} · {formatDateOnly(doc.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {verificationBadge(doc.verification_status)}
                    <a href={doc.document_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#c9a227] hover:underline">
                      View
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-[#6b5d4d]">No documents uploaded yet.</p>
          )}

          {/* Push notification settings */}
          <PushDeviceSettings />
        </div>
      ) : null}
    </section>
  );
}
