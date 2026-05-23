export type EmployeeProfileDetails = {
  id?: string;
  profile_id: string;
  profile_photo_url: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  marital_status: string | null;
  nationality: string | null;
  personal_email: string | null;
  bio: string | null;
  personal_mobile: string | null;
  alternate_mobile: string | null;
  current_address_line1: string | null;
  current_address_line2: string | null;
  current_city: string | null;
  current_state: string | null;
  current_pincode: string | null;
  current_country: string | null;
  same_as_current: boolean;
  permanent_address_line1: string | null;
  permanent_address_line2: string | null;
  permanent_city: string | null;
  permanent_state: string | null;
  permanent_pincode: string | null;
  permanent_country: string | null;
  emergency_contact_1_name: string | null;
  emergency_contact_1_relationship: string | null;
  emergency_contact_1_phone: string | null;
  emergency_contact_1_alt_phone: string | null;
  emergency_contact_1_address: string | null;
  emergency_contact_2_name: string | null;
  emergency_contact_2_relationship: string | null;
  emergency_contact_2_phone: string | null;
  emergency_contact_2_alt_phone: string | null;
  emergency_contact_2_address: string | null;
  skills: string[];
  tools_known: string[];
  certifications: string[];
  languages_known: string[];
  years_of_experience: number | null;
  previous_company: string | null;
  portfolio_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  behance_url: string | null;
  website_url: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  branch_name: string | null;
  upi_id: string | null;
  pan_number: string | null;
  aadhaar_number: string | null;
  passport_number: string | null;
  preferred_work_mode: string | null;
  preferred_communication_channel: string | null;
  notification_preferences: Record<string, boolean>;
  preferred_language: string | null;
  profile_completion: number;
};

export type EmployeeDocumentRow = {
  id: string;
  profile_id: string;
  document_type: string;
  document_name: string;
  document_url: string;
  storage_path: string;
  verification_status: string;
  uploaded_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export const PROFILE_DETAIL_SELECT = "*";

export const DOCUMENT_TYPES = [
  "Profile Photo",
  "Aadhaar",
  "PAN",
  "Resume",
  "Offer Letter signed copy",
  "Experience Letter",
  "Education Certificate",
  "Bank Proof",
  "Other Document",
] as const;

export const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal Information" },
  { id: "contact", label: "Contact & Address" },
  { id: "emergency", label: "Emergency Contact" },
  { id: "skills", label: "Skills & Professional" },
  { id: "bank", label: "Bank & Compliance" },
  { id: "documents", label: "Documents" },
  { id: "preferences", label: "Preferences" },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return !Number.isNaN(v);
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

export function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function emptyProfileDetails(profileId: string): EmployeeProfileDetails {
  return {
    profile_id: profileId,
    profile_photo_url: null,
    preferred_name: null,
    date_of_birth: null,
    gender: null,
    blood_group: null,
    marital_status: null,
    nationality: null,
    personal_email: null,
    bio: null,
    personal_mobile: null,
    alternate_mobile: null,
    current_address_line1: null,
    current_address_line2: null,
    current_city: null,
    current_state: null,
    current_pincode: null,
    current_country: null,
    same_as_current: false,
    permanent_address_line1: null,
    permanent_address_line2: null,
    permanent_city: null,
    permanent_state: null,
    permanent_pincode: null,
    permanent_country: null,
    emergency_contact_1_name: null,
    emergency_contact_1_relationship: null,
    emergency_contact_1_phone: null,
    emergency_contact_1_alt_phone: null,
    emergency_contact_1_address: null,
    emergency_contact_2_name: null,
    emergency_contact_2_relationship: null,
    emergency_contact_2_phone: null,
    emergency_contact_2_alt_phone: null,
    emergency_contact_2_address: null,
    skills: [],
    tools_known: [],
    certifications: [],
    languages_known: [],
    years_of_experience: null,
    previous_company: null,
    portfolio_url: null,
    linkedin_url: null,
    github_url: null,
    behance_url: null,
    website_url: null,
    bank_name: null,
    account_holder_name: null,
    account_number: null,
    ifsc_code: null,
    branch_name: null,
    upi_id: null,
    pan_number: null,
    aadhaar_number: null,
    passport_number: null,
    preferred_work_mode: null,
    preferred_communication_channel: null,
    notification_preferences: {},
    preferred_language: null,
    profile_completion: 0,
  };
}

export function mapRowToProfileDetails(row: Record<string, unknown>, profileId: string): EmployeeProfileDetails {
  const base = emptyProfileDetails(profileId);
  return {
    ...base,
    ...row,
    profile_id: profileId,
    skills: parseStringArray(row.skills),
    tools_known: parseStringArray(row.tools_known),
    certifications: parseStringArray(row.certifications),
    languages_known: parseStringArray(row.languages_known),
    same_as_current: Boolean(row.same_as_current),
    years_of_experience:
      row.years_of_experience === null || row.years_of_experience === undefined
        ? null
        : Number(row.years_of_experience),
    notification_preferences:
      row.notification_preferences && typeof row.notification_preferences === "object"
        ? (row.notification_preferences as Record<string, boolean>)
        : {},
    profile_completion: Number(row.profile_completion ?? 0),
  };
}

export function calculateProfileCompletion(d: EmployeeProfileDetails): number {
  const checks: unknown[] = [
    d.profile_photo_url,
    d.preferred_name,
    d.date_of_birth,
    d.gender,
    d.personal_email,
    d.bio,
    d.personal_mobile,
    d.current_address_line1,
    d.current_city,
    d.current_state,
    d.current_pincode,
    d.emergency_contact_1_name,
    d.emergency_contact_1_phone,
    d.skills,
    d.languages_known,
    d.bank_name,
    d.account_holder_name,
    d.account_number,
    d.ifsc_code,
    d.pan_number,
    d.preferred_work_mode,
    d.preferred_communication_channel,
    d.preferred_language,
    Object.keys(d.notification_preferences || {}).length ? d.notification_preferences : null,
  ];
  const done = checks.filter(filled).length;
  return Math.min(100, Math.round((done / checks.length) * 100));
}

export function maskAccount(value: string | null | undefined) {
  const s = (value ?? "").replace(/\s/g, "");
  if (!s) return "—";
  if (s.length <= 4) return "****";
  return `${"X".repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}

export function maskAadhaar(value: string | null | undefined) {
  const s = (value ?? "").replace(/\D/g, "");
  if (!s) return "—";
  if (s.length <= 4) return "XXXX";
  return `XXXX XXXX ${s.slice(-4)}`;
}

export function maskPan(value: string | null | undefined) {
  const s = (value ?? "").trim().toUpperCase();
  if (!s) return "—";
  if (s.length <= 4) return "****";
  return `${s.slice(0, 2)}****${s.slice(-2)}`;
}

export function tagsToPayload(tags: string[]) {
  return tags.map((t) => t.trim()).filter(Boolean);
}

export function profileDetailsToDbPayload(d: EmployeeProfileDetails, userId: string) {
  const completion = calculateProfileCompletion(d);
  return {
    ...d,
    skills: tagsToPayload(d.skills),
    tools_known: tagsToPayload(d.tools_known),
    certifications: tagsToPayload(d.certifications),
    languages_known: tagsToPayload(d.languages_known),
    profile_completion: completion,
    last_updated_by: userId,
  };
}
