"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDisplayDate } from "@/lib/datetime";
import { saveTaskCollegeSelection } from "@/lib/taskLeadPickStorage";
import { deleteOwnedCollegeVisits } from "@/lib/crmOwnedDelete";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import {
  fetchWhatsAppTemplates,
  formatEmailActivityNotes,
  formatWhatsAppActivityNotes,
  MAX_EMAIL_MESSAGE_LENGTH,
  MAX_WHATSAPP_MESSAGE_LENGTH,
} from "@/lib/whatsappOutreach";
import { Button } from "@/components/ui/button";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import {
  ResponsiveDataView,
  TABLE_CHECK_TD,
  TABLE_CHECK_TH,
  TABLE_DATA_TD,
  TABLE_DATA_TH,
  TABLE_SNO_TD,
  TABLE_SNO_TH,
} from "@/components/ui/ResponsiveDataView";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { CollegeVisitFormPanel } from "@/components/college-visits/CollegeVisitFormPanel";
import {
  downloadCollegeVisitImportTemplate,
  exportCollegeVisitsCsv,
  collegeVisitFileToMatrix,
  parseCollegeVisitMatrix,
} from "@/components/college-visits/collegeVisitsCsv";
import {
  COLLEGE_PRIORITIES,
  CV_TAB_IDS,
  CV_TAB_LABELS,
  FINAL_STATUSES,
  VISIT_STATUSES,
  type CvTabId,
} from "@/components/college-visits/collegeVisitsConfig";
import {
  CollegeActivityTimeline,
  CollegeConvertedTable,
  CollegeFollowUpsPanel,
  CollegeMouTrackerTable,
  CollegeOverviewPanel,
  CollegePipelineBoard,
  CollegeProposalEditModal,
  CollegeProposalTrackerTable,
  CollegeReportsPanel,
  CollegeSettingsPanel,
  type CollegeProposalDraft,
} from "@/components/college-visits/CollegeVisitsSubsections";
import {
  buildCollegeVisitPayload,
  collegeVisitRowToForm,
  daysSince,
  emptyCollegeVisitForm,
  friendlyCollegeVisitError,
  isFollowUpDue,
  isMissingCollegeVisitsTable,
  primaryOutreachPhone,
  collegeOutreachTargets,
  type CollegeOutreachTarget,
  type CollegeVisitActivityRow,
  type CollegeVisitFormValue,
  type CollegeVisitRow,
} from "@/components/college-visits/collegeVisitsHelpers";
import { ProposalFileUpload, uploadProposalFile } from "@/components/shared/ProposalFileUpload";
import type { ProposalFileMeta } from "@/lib/proposalFiles";

type CollegeOutreachFlags = {
  phoneCalled?: boolean;
  whatsappSent?: boolean;
  emailSent?: boolean;
};

type OutreachPickerState =
  | { mode: "phone"; row: CollegeVisitRow; targets: CollegeOutreachTarget[] }
  | { mode: "whatsapp"; row: CollegeVisitRow; targets: CollegeOutreachTarget[] }
  | { mode: "email"; row: CollegeVisitRow; targets: CollegeOutreachTarget[] };

type AppRole = "admin" | "employee";

interface ProfileMini {
  id: string;
  full_name: string | null;
  email: string | null;
}

function ownerPeopleFromProfiles(employees: ProfileMini[]) {
  return employees.map((e) => ({
    id: e.id,
    label: e.full_name || e.email || "Unnamed",
    email: e.email,
  }));
}

export function CollegeVisitsWorkbench({ role, fullAccess = false }: { role: AppRole; fullAccess?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pickForTask = searchParams.get("pickForTask") === "1";
  const defaultReturnTo = role === "admin" ? "/admin/task-assignment" : "/employee/my-tasks";
  const returnTo = searchParams.get("returnTo") || defaultReturnTo;
  const isEmployeePortal = role === "employee";
  const isAdmin = role === "admin" || (isEmployeePortal && fullAccess);
  const isDbAdmin = role === "admin";

  const [currentUserId, setCurrentUserId] = useState("");
  const [employees, setEmployees] = useState<ProfileMini[]>([]);
  const [visits, setVisits] = useState<CollegeVisitRow[]>([]);
  const [activities, setActivities] = useState<CollegeVisitActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [fltVisitStatus, setFltVisitStatus] = useState("");
  const [fltPriority, setFltPriority] = useState("");
  const [fltOwner, setFltOwner] = useState("");
  const [fltFinalStatus, setFltFinalStatus] = useState("");
  const [fltFollowUpDue, setFltFollowUpDue] = useState("");
  const [listScope] = useState<"mine">("mine");
  const [activeTab, setActiveTab] = useState<CvTabId>("overview");
  const [timelineRows, setTimelineRows] = useState<CollegeVisitActivityRow[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CollegeVisitFormValue>(() => emptyCollegeVisitForm());
  const [viewVisit, setViewVisit] = useState<CollegeVisitRow | null>(null);
  const [proposalRow, setProposalRow] = useState<CollegeVisitRow | null>(null);
  const [proposalDraft, setProposalDraft] = useState<CollegeProposalDraft>({
    status: "Not Sent",
    amount: "",
    sent_date: "",
    proposal_link: "",
    proposal_pdf_url: "",
    proposal_pdf_name: "",
  });
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [pendingProposalFile, setPendingProposalFile] = useState<File | null>(null);
  const [proposalFileMeta, setProposalFileMeta] = useState<ProposalFileMeta>({
    proposal_file_name: null,
    proposal_file_path: null,
    proposal_file_type: null,
    proposal_file_size: null,
    proposal_uploaded_at: null,
    proposal_link: null,
    proposal_pdf_url: null,
    proposal_pdf_name: null,
  });
  const [bulkAssignTo, setBulkAssignTo] = useState("");
  const [pickedCollegeIds, setPickedCollegeIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [outreachDone, setOutreachDone] = useState<Record<string, CollegeOutreachFlags>>({});
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<string[]>([]);
  const [whatsAppComposeVisit, setWhatsAppComposeVisit] = useState<CollegeVisitRow | null>(null);
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);
  const [emailComposeVisit, setEmailComposeVisit] = useState<CollegeVisitRow | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailComposeTarget, setEmailComposeTarget] = useState<CollegeOutreachTarget | null>(null);
  const [outreachPicker, setOutreachPicker] = useState<OutreachPickerState | null>(null);
  const [whatsAppTargetPhone, setWhatsAppTargetPhone] = useState("");

  const ownerOptions = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        label: e.full_name || e.email || "Unnamed",
      })),
    [employees],
  );

  const ownerNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    employees.forEach((e) => {
      m[e.id] = e.full_name || e.email || e.id.slice(0, 8);
    });
    return m;
  }, [employees]);

  const loadVisits = useCallback(async () => {
    const res = await fetch("/api/college-visits");
    const json = (await res.json()) as { visits?: CollegeVisitRow[]; error?: string };
    if (!res.ok) {
      const msg = json.error ?? "Could not load college visits.";
      if (isMissingCollegeVisitsTable(msg)) {
        setSchemaMissing(true);
        setVisits([]);
        return;
      }
      throw new Error(msg);
    }
    setSchemaMissing(false);
    setVisits(json.visits ?? []);
  }, []);

  const togglePickCollege = (id: string) => {
    setPickedCollegeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmCollegePick = () => {
    const labels = visits.filter((v) => pickedCollegeIds.has(v.id)).map((v) => v.college_name);
    const pathParts = ["College Visits", CV_TAB_LABELS[activeTab]];
    if (listScope === "mine") pathParts.push("My assigned");
    if (fltVisitStatus) pathParts.push(`Visit=${fltVisitStatus}`);
    if (fltOwner) pathParts.push(`Owner filter`);
    if (searchText.trim()) pathParts.push(`Search="${searchText.trim()}"`);
    saveTaskCollegeSelection({
      ids: [...pickedCollegeIds],
      labels,
      filterPath: pathParts.join(" -> "),
    });
    router.push(decodeURIComponent(returnTo));
  };

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      await loadVisits();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadVisits]);

  useEffect(() => {
    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setCurrentUserId(user.id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("role", ["employee", "admin", "super_admin"])
        .or("status.is.null,status.eq.active")
        .order("full_name", { ascending: true });
      setEmployees((profiles as ProfileMini[] | null) ?? []);

      try {
        setWhatsAppTemplates(await fetchWhatsAppTemplates(supabase));
      } catch {
        setWhatsAppTemplates([]);
      }
    }
    void bootstrap();
  }, [supabase]);

  const logCollegeActivity = useCallback(async (visitId: string, activity_type: string, notes: string) => {
    const res = await fetch(`/api/college-visits/${visitId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_type, notes }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || "Could not save outreach activity.");
    }
    const json = (await res.json()) as { activity?: CollegeVisitActivityRow };
    if (json.activity) {
      setActivities((prev) => [json.activity!, ...prev]);
      setTimelineRows((prev) => [json.activity!, ...prev]);
    }
  }, []);

  const markOutreach = useCallback((visitId: string, patch: CollegeOutreachFlags) => {
    setOutreachDone((prev) => ({ ...prev, [visitId]: { ...prev[visitId], ...patch } }));
  }, []);

  const handleCollegePhoneClick = useCallback(
    async (row: CollegeVisitRow, phoneOverride?: string) => {
      const phone = (phoneOverride || primaryOutreachPhone(row)).trim();
      if (!phone) {
        setError("No contact number on this college.");
        return;
      }
      setError(null);
      setOutreachPicker(null);
      markOutreach(row.id, { phoneCalled: true });
      window.location.href = `tel:${phone}`;
      try {
        await logCollegeActivity(row.id, "Phone Call", `Called ${phone}`);
        setSuccess("Call started and logged to activity.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not log call.");
      }
    },
    [logCollegeActivity, markOutreach],
  );

  const requestCollegePhone = useCallback(
    (row: CollegeVisitRow) => {
      const phoneTargets = collegeOutreachTargets(row).filter((t) => t.phone);
      if (phoneTargets.length === 0) {
        setError("No contact number on this college.");
        return;
      }
      if (phoneTargets.length === 1) {
        void handleCollegePhoneClick(row, phoneTargets[0].phone);
        return;
      }
      setOutreachPicker({ mode: "phone", row, targets: phoneTargets });
    },
    [handleCollegePhoneClick],
  );

  const openCollegeWhatsAppCompose = useCallback((row: CollegeVisitRow, phoneOverride?: string) => {
    const phone = (phoneOverride || primaryOutreachPhone(row)).trim();
    if (!whatsAppHref(phone)) {
      setError("No WhatsApp number on this college.");
      return;
    }
    setError(null);
    setOutreachPicker(null);
    setWhatsAppTargetPhone(phone);
    setWhatsAppComposeVisit(row);
  }, []);

  const requestCollegeWhatsApp = useCallback(
    (row: CollegeVisitRow) => {
      const phoneTargets = collegeOutreachTargets(row).filter((t) => t.phone);
      if (phoneTargets.length === 0) {
        setError("No WhatsApp number on this college.");
        return;
      }
      if (phoneTargets.length === 1) {
        openCollegeWhatsAppCompose(row, phoneTargets[0].phone);
        return;
      }
      setOutreachPicker({ mode: "whatsapp", row, targets: phoneTargets });
    },
    [openCollegeWhatsAppCompose],
  );

  const handleCollegeWhatsAppSend = useCallback(
    async (message: string) => {
      if (!whatsAppComposeVisit) return;
      const trimmed = message.trim();
      if (!trimmed) {
        setError("Enter a message before opening WhatsApp.");
        return;
      }
      if (trimmed.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
        setError(`Message is too long (max ${MAX_WHATSAPP_MESSAGE_LENGTH} characters).`);
        return;
      }
      const phone = (whatsAppTargetPhone || primaryOutreachPhone(whatsAppComposeVisit)).trim();
      const wa = whatsAppHref(phone, trimmed);
      if (!wa) {
        setError("No WhatsApp number on this college.");
        return;
      }

      setWhatsAppSubmitting(true);
      setError(null);
      markOutreach(whatsAppComposeVisit.id, { whatsappSent: true });
      window.open(wa, "_blank", "noopener,noreferrer");

      try {
        await logCollegeActivity(
          whatsAppComposeVisit.id,
          "WhatsApp Message",
          formatWhatsAppActivityNotes(trimmed),
        );
        setWhatsAppComposeVisit(null);
        setWhatsAppTargetPhone("");
        setSuccess("WhatsApp opened and message saved to activity history.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not log WhatsApp.");
      } finally {
        setWhatsAppSubmitting(false);
      }
    },
    [logCollegeActivity, markOutreach, whatsAppComposeVisit, whatsAppTargetPhone],
  );

  const openCollegeEmailCompose = useCallback((row: CollegeVisitRow, target?: CollegeOutreachTarget) => {
    const email = (target?.email || row.email || "").trim();
    if (!email) {
      const withEmail = collegeOutreachTargets(row).find((t) => t.email.trim());
      if (!withEmail?.email) {
        setError("No email address on this college.");
        return;
      }
      setEmailComposeTarget(withEmail);
      setEmailComposeVisit(row);
      setError(null);
      setOutreachPicker(null);
      return;
    }
    setError(null);
    setOutreachPicker(null);
    setEmailComposeTarget(target ?? { key: "primary", contactId: "", personLabel: row.connected_person_name || "Contact", role: row.connected_person_role || "", phone: "", email });
    setEmailComposeVisit(row);
  }, []);

  const requestCollegeEmail = useCallback(
    (row: CollegeVisitRow) => {
      const emailTargets = collegeOutreachTargets(row).filter((t) => t.email.trim());
      // de-dupe by email
      const uniq: CollegeOutreachTarget[] = [];
      const seen = new Set<string>();
      for (const t of emailTargets) {
        const key = t.email.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(t);
      }
      if (uniq.length === 0) {
        setError("No email address on this college.");
        return;
      }
      if (uniq.length === 1) {
        openCollegeEmailCompose(row, uniq[0]);
        return;
      }
      setOutreachPicker({ mode: "email", row, targets: uniq });
    },
    [openCollegeEmailCompose],
  );

  const handleCollegeEmailSend = useCallback(
    async (message: string) => {
      if (!emailComposeVisit) return;
      const email = (emailComposeTarget?.email || emailComposeVisit.email || "").trim();
      if (!email) {
        setError("No email address on this college.");
        return;
      }
      const trimmed = message.trim();
      if (!trimmed) {
        setError("Enter a message before sending email.");
        return;
      }
      if (trimmed.length > MAX_EMAIL_MESSAGE_LENGTH) {
        setError(`Message is too long (max ${MAX_EMAIL_MESSAGE_LENGTH} characters).`);
        return;
      }

      setEmailSubmitting(true);
      setError(null);
      const subject = `AJ Academy follow-up for ${emailComposeVisit.college_name}${
        emailComposeTarget?.personLabel ? ` (${emailComposeTarget.personLabel})` : ""
      }`;

      try {
        const mailRes = await fetch("/api/outreach/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: email, subject, body: trimmed }),
        });
        const mailPayload = (await mailRes.json().catch(() => ({}))) as { error?: string };
        if (!mailRes.ok) {
          setError(mailPayload.error || "Could not send email.");
          setEmailSubmitting(false);
          return;
        }

        markOutreach(emailComposeVisit.id, { emailSent: true });
        await logCollegeActivity(emailComposeVisit.id, "Email", formatEmailActivityNotes(trimmed));
        setEmailComposeVisit(null);
        setEmailComposeTarget(null);
        setSuccess("Email sent and logged to activity.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send email.");
      } finally {
        setEmailSubmitting(false);
      }
    },
    [emailComposeTarget, emailComposeVisit, logCollegeActivity, markOutreach],
  );

  useEffect(() => {
    if (!currentUserId) return;
    void reload();
  }, [currentUserId, reload]);

  useEffect(() => {
    if (pickForTask) setActiveTab("all-colleges");
  }, [pickForTask]);

  useEffect(() => {
    if (isEmployeePortal && (activeTab === "reports" || activeTab === "settings")) {
      setActiveTab("overview");
    }
  }, [activeTab, isEmployeePortal]);

  useEffect(() => {
    if (!viewVisit?.id) {
      setActivities([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/college-visits/${viewVisit.id}/activities`);
      const json = (await res.json()) as { activities?: CollegeVisitActivityRow[] };
      setActivities(json.activities ?? []);
    })();
  }, [viewVisit?.id]);

  const visibleTabIds = useMemo(() => {
    if (isEmployeePortal) return CV_TAB_IDS.filter((id) => id !== "reports" && id !== "settings");
    return [...CV_TAB_IDS];
  }, [isEmployeePortal]);

  const visitMap = useMemo(() => {
    const m: Record<string, CollegeVisitRow> = {};
    visits.forEach((v) => {
      m[v.id] = v;
    });
    return m;
  }, [visits]);

  const filteredVisits = useMemo(() => {
    let list = [...visits];
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        `${v.college_name} ${v.location ?? ""} ${v.contact_number ?? ""} ${v.email ?? ""} ${v.connected_person_name ?? ""} ${v.source_reference ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (fltVisitStatus) list = list.filter((v) => v.visit_status === fltVisitStatus);
    if (fltPriority) list = list.filter((v) => v.priority === fltPriority);
    if (fltOwner) list = list.filter((v) => (v.assigned_to ?? "") === fltOwner);
    if (fltFinalStatus) list = list.filter((v) => v.final_status === fltFinalStatus);
    if (fltFollowUpDue === "yes") list = list.filter((v) => isFollowUpDue(v));
    if (fltFollowUpDue === "no") list = list.filter((v) => !isFollowUpDue(v));
    return list;
  }, [visits, searchText, fltVisitStatus, fltPriority, fltOwner, fltFinalStatus, fltFollowUpDue]);

  const filtersActive = Boolean(
    searchText.trim() || fltVisitStatus || fltPriority || fltOwner || fltFinalStatus || fltFollowUpDue,
  );

  const clearTableFilters = () => {
    setSearchText("");
    setFltVisitStatus("");
    setFltPriority("");
    setFltOwner("");
    setFltFinalStatus("");
    setFltFollowUpDue("");
  };

  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(filteredVisits, 25);

  /** Select across the full filtered set (not only the current page). */
  const visitBulk = useRowSelection(filteredVisits, (v) => v.id);

  useEffect(() => {
    visitBulk.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset selection on tab change
  }, [activeTab, pickForTask]);

  useEffect(() => {
    if (activeTab !== "timeline" || !visits.length) {
      if (activeTab !== "timeline") setTimelineRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setTimelineLoading(true);
      try {
        const ids = visits.map((v) => v.id);
        const { data, error: actErr } = await supabase
          .from("college_visit_activities")
          .select("id,college_visit_id,activity_type,notes,old_value,new_value,created_by,created_at")
          .in("college_visit_id", ids)
          .order("created_at", { ascending: false })
          .limit(400);
        if (actErr) throw new Error(actErr.message);
        if (!cancelled) setTimelineRows((data as CollegeVisitActivityRow[] | null) ?? []);
      } catch (e) {
        if (!cancelled) setError(friendlyCollegeVisitError(e));
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, visits, supabase]);

  const rowsForExport = useMemo(() => {
    if (visitBulk.selectedCount > 0) {
      return filteredVisits.filter((v) => visitBulk.selected.has(v.id));
    }
    return filteredVisits;
  }, [filteredVisits, visitBulk.selected, visitBulk.selectedCount]);

  const changePipelineStatus = async (row: CollegeVisitRow, visit_status: string) => {
    if (!currentUserId || row.visit_status === visit_status) return;
    setSubmitting(true);
    setError(null);
    try {
      const formRow = { ...collegeVisitRowToForm(row), visit_status };
      const payload = buildCollegeVisitPayload(formRow, { userId: currentUserId, isDbAdmin });
      const res = await fetch(`/api/college-visits/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formRow, assigned_to: payload.assigned_to ?? "" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not update visit status.");
      setSuccess(`Visit status -> ${visit_status}`);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyCollegeVisitForm(currentUserId));
    setPendingProposalFile(null);
    setProposalFileMeta({
      proposal_file_name: null,
      proposal_file_path: null,
      proposal_file_type: null,
      proposal_file_size: null,
      proposal_uploaded_at: null,
      proposal_link: null,
      proposal_pdf_url: null,
      proposal_pdf_name: null,
    });
    setPanelOpen(true);
    setError(null);
    setSuccess(null);
  };

  const openEdit = (row: CollegeVisitRow) => {
    setEditId(row.id);
    setForm(collegeVisitRowToForm(row));
    setPendingProposalFile(null);
    setProposalFileMeta({
      proposal_file_name: row.proposal_file_name ?? null,
      proposal_file_path: row.proposal_file_path ?? null,
      proposal_file_type: row.proposal_file_type ?? null,
      proposal_file_size: row.proposal_file_size ?? null,
      proposal_uploaded_at: row.proposal_uploaded_at ?? null,
      proposal_link: row.proposal_link ?? null,
      proposal_pdf_url: row.proposal_pdf_url ?? null,
      proposal_pdf_name: row.proposal_pdf_name ?? null,
    });
    setPanelOpen(true);
    setViewVisit(null);
  };

  const openProposalModal = (row: CollegeVisitRow) => {
    setProposalRow(row);
    setProposalDraft({
      status: row.proposal_status || "Not Sent",
      amount: row.proposal_amount != null ? String(row.proposal_amount) : "",
      sent_date: row.proposal_sent_date?.slice(0, 10) ?? "",
      proposal_link: row.proposal_link ?? "",
      proposal_pdf_url: row.proposal_pdf_url ?? "",
      proposal_pdf_name: row.proposal_pdf_name ?? "",
    });
    setPendingProposalFile(null);
    setProposalFileMeta({
      proposal_file_name: row.proposal_file_name ?? null,
      proposal_file_path: row.proposal_file_path ?? null,
      proposal_file_type: row.proposal_file_type ?? null,
      proposal_file_size: row.proposal_file_size ?? null,
      proposal_uploaded_at: row.proposal_uploaded_at ?? null,
      proposal_link: row.proposal_link ?? null,
      proposal_pdf_url: row.proposal_pdf_url ?? null,
      proposal_pdf_name: row.proposal_pdf_name ?? null,
    });
    setError(null);
    setSuccess(null);
  };

  const handleProposalSave = async () => {
    if (!proposalRow || !currentUserId) return;
    setProposalSubmitting(true);
    setError(null);
    setSuccess(null);
    const fileToUpload = pendingProposalFile;
    try {
      const base = collegeVisitRowToForm(proposalRow);
      const formRow: CollegeVisitFormValue = {
        ...base,
        proposal_status: proposalDraft.status || "Not Sent",
        proposal_amount: proposalDraft.amount,
        proposal_sent_date: proposalDraft.sent_date,
        proposal_link: proposalDraft.proposal_link,
        proposal_pdf_url: proposalDraft.proposal_pdf_url,
        proposal_pdf_name: proposalDraft.proposal_pdf_name,
      };
      const res = await fetch(`/api/college-visits/${proposalRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formRow),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save proposal.");
      if (fileToUpload) {
        await uploadProposalFile({
          entityType: "college",
          entityId: proposalRow.id,
          file: fileToUpload,
        });
        setPendingProposalFile(null);
      }
      setSuccess(fileToUpload ? "Proposal updated and file uploaded." : "Proposal updated.");
      setProposalRow(null);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setProposalSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!currentUserId || !form.college_name.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const fileToUpload = pendingProposalFile;
    const editingId = editId;
    try {
      const payload = buildCollegeVisitPayload(form, { userId: currentUserId, isDbAdmin });
      if (editingId) {
        const res = await fetch(`/api/college-visits/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, assigned_to: payload.assigned_to ?? "" }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Update failed.");
        if (fileToUpload) {
          const uploaded = await uploadProposalFile({
            entityType: "college",
            entityId: editingId,
            file: fileToUpload,
          });
          setProposalFileMeta((m) => ({ ...m, ...uploaded }));
          setPendingProposalFile(null);
        }
        setSuccess(fileToUpload ? "College visit updated and proposal uploaded." : "College visit updated.");
      } else {
        const res = await fetch("/api/college-visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, assigned_to: payload.assigned_to ?? "" }),
        });
        const json = (await res.json()) as { visit?: { id?: string }; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Create failed.");
        const nid = json.visit?.id;
        if (nid && fileToUpload) {
          const uploaded = await uploadProposalFile({
            entityType: "college",
            entityId: nid,
            file: fileToUpload,
          });
          setProposalFileMeta((m) => ({ ...m, ...uploaded }));
          setPendingProposalFile(null);
        }
        setSuccess(nid && fileToUpload ? "College visit created and proposal uploaded." : "College visit created.");
      }
      setPanelOpen(false);
      setEditId(null);
      setPendingProposalFile(null);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this college visit permanently?")) return;
    const res = await fetch(`/api/college-visits/${id}`, { method: "DELETE" });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Delete failed.");
      return;
    }
    setSuccess("Deleted.");
    setViewVisit(null);
    await reload();
  };

  const handleBulkAssign = async () => {
    if (!isDbAdmin || !bulkAssignTo || visitBulk.selectedCount === 0 || !currentUserId) return;
    const label = ownerNameMap[bulkAssignTo] || "assignee";
    const ids = [...visitBulk.selected];
    if (
      !confirm(
        `Assign ${ids.length} college(s) to ${label} as a College Visit task?\n\nThe employee will work them under My Tasks -> College Visit (not as CRM-owned College Visits ownership).`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: inserted, error: insertError } = await supabase
        .from("tasks")
        .insert({
          title: `College visit outreach (${ids.length})`,
          description: `Assigned from College Visits | ${ids.length} linked college(s).`,
          assigned_to: bulkAssignTo,
          assigned_by: currentUserId,
          assignment_type: "college",
          client_ids: [],
          college_visit_ids: ids,
          project_id: null,
          priority: "Medium",
          status: "Pending",
          progress: 0,
          start_date: today,
          due_date: null,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      try {
        await supabase.rpc("create_task_assignment_notification", { p_task_id: inserted.id });
      } catch {
        /* optional */
      }
      visitBulk.clearSelection();
      setBulkAssignTo("");
      setSuccess(`${ids.length} college(s) sent to ${label} as My Tasks -> College Visit.`);
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (visitBulk.selectedCount === 0 || !currentUserId) return;
    if (!confirm(`Delete ${visitBulk.selectedCount} selected college visit(s)?`)) return;
    setSubmitting(true);
    try {
      const ids = [...visitBulk.selected];
      const { deleted, error: deleteError } = await deleteOwnedCollegeVisits(supabase, ids, currentUserId, {
        isAdmin: isDbAdmin,
      });
      if (deleteError) throw new Error(deleteError);
      if (!deleted) {
        throw new Error(
          isDbAdmin
            ? "No college visits were deleted. Re-run AJ_Academy_SB/crm_owner_isolation.sql and crm_delete_fix.sql in Supabase if needed."
            : "No college visits were deleted. You can only delete your own rows. Run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed.",
        );
      }
      visitBulk.clearSelection();
      setSuccess(
        deleted === ids.length
          ? `${deleted} college visit(s) deleted.`
          : `${deleted} of ${ids.length} deleted (others were not yours).`,
      );
      await reload();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadCollegeVisitImportTemplate();
    setSuccess("Import template downloaded (headers match the College Visits table).");
  };

  const handleExport = () => {
    if (!rowsForExport.length) {
      setError("No rows match the current filters to export.");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const filename =
      visitBulk.selectedCount > 0
        ? `college-visits-selected-${date}.csv`
        : filtersActive
          ? `college-visits-filtered-${date}.csv`
          : `college-visits-${date}.csv`;
    exportCollegeVisitsCsv(rowsForExport, ownerNameMap, filename);
    setSuccess(
      visitBulk.selectedCount > 0
        ? `Exported ${rowsForExport.length} selected row(s).`
        : filtersActive
          ? `Exported ${rowsForExport.length} filtered row(s) (of ${visits.length} total).`
          : `Exported all ${rowsForExport.length} college visit row(s).`,
    );
  };

  const handleImportFile = async (file: File) => {
    if (!currentUserId || !isAdmin) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const matrix = await collegeVisitFileToMatrix(file);
      const { forms, errors } = parseCollegeVisitMatrix(matrix, {
        owners: ownerPeopleFromProfiles(employees),
        defaultOwnerId: currentUserId,
        isDbAdmin,
      });
      let ok = 0;
      let fail = errors.length;
      const rowErrors = [...errors];

      for (const formRow of forms) {
        const payload = buildCollegeVisitPayload(formRow, { userId: currentUserId, isDbAdmin });
        const res = await fetch("/api/college-visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formRow, assigned_to: payload.assigned_to ?? "" }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          fail += 1;
          rowErrors.push(json.error ?? "Insert failed.");
        } else {
          ok += 1;
        }
      }

      await reload();
      setSuccess(
        `Import complete: ${ok} added, ${fail} failed.${rowErrors.length ? ` ${rowErrors.slice(0, 3).join(" ")}` : ""}`,
      );
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const thClass = TABLE_DATA_TH;
  const tdClass = TABLE_DATA_TD;
  const dash = (v: unknown) => (v == null || v === "" ? "—" : String(v));
return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">College Visits</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isDbAdmin
              ? "Track every employee's college outreach. Filter by Owner to review one person. Employees only see their own rows."
              : "Your college outreach only - Overview, All Colleges, Follow-ups, Pipeline, Proposal Tracker, and more."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading} onClick={() => void reload()}>
            Refresh
          </Button>
          {isAdmin && !pickForTask ? (
            <Button className="h-9 rounded-full bg-[#c9a227] px-5 text-white hover:bg-[#b8921f]" onClick={openCreate}>
              + Add College
            </Button>
          ) : null}
        </div>
      </header>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-200 bg-[#faf3e3] px-4 py-3 text-sm text-[#7a5c12]">
          College Visits table is missing. Run <strong>AJ_Academy_SB/college_visits_schema.sql</strong> in Supabase SQL Editor, then refresh.
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{success}</div> : null}

      {pickForTask ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a227] bg-[#fef3c7] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[#92400e]">Selecting colleges for task assignment</p>
            <p className="text-xs text-[#78350f]">
              Tab: {CV_TAB_LABELS[activeTab]} | {pickedCollegeIds.size} selected | use All Colleges filters below
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => router.push(decodeURIComponent(returnTo))}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
              disabled={!pickedCollegeIds.size}
              onClick={confirmCollegePick}
            >
              Confirm {pickedCollegeIds.size ? `${pickedCollegeIds.size} college(s)` : "selection"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {visibleTabIds.map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={
                activeTab === tabId
                  ? "rounded-xl bg-[#c9a227] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-[#eaf1ff]"
              }
            >
              {CV_TAB_LABELS[tabId]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? <CollegeOverviewPanel visits={visits} loading={loading} /> : null}

      {activeTab === "follow-ups" ? (
        <CollegeFollowUpsPanel visits={filteredVisits} ownerNameMap={ownerNameMap} loading={loading} onOpen={setViewVisit} />
      ) : null}

      {activeTab === "pipeline" ? (
        <CollegePipelineBoard visits={filteredVisits} canEdit={isAdmin} onChangeStatus={(row, s) => void changePipelineStatus(row, s)} />
      ) : null}

      {activeTab === "converted" ? (
        <CollegeConvertedTable visits={filteredVisits} ownerNameMap={ownerNameMap} onOpen={setViewVisit} />
      ) : null}

      {activeTab === "mou" ? (
        <CollegeMouTrackerTable visits={filteredVisits} ownerNameMap={ownerNameMap} canEdit={isAdmin} onEdit={openEdit} />
      ) : null}

      {activeTab === "proposal" ? (
        <CollegeProposalTrackerTable
          visits={filteredVisits}
          ownerNameMap={ownerNameMap}
          canEdit={isAdmin}
          onEdit={openProposalModal}
        />
      ) : null}

      {activeTab === "timeline" ? (
        <CollegeActivityTimeline activities={timelineRows} visitMap={visitMap} ownerNameMap={ownerNameMap} loading={timelineLoading} />
      ) : null}

      {activeTab === "reports" && isDbAdmin ? <CollegeReportsPanel visits={filteredVisits} ownerNameMap={ownerNameMap} /> : null}
      {activeTab === "settings" && isDbAdmin ? <CollegeSettingsPanel /> : null}

      {activeTab === "all-colleges" ? (
        <div className="space-y-3">
          {!pickForTask ? (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              <Button type="button" variant="outline" className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm" onClick={handleDownloadTemplate}>
                <FileText className="mr-1 h-4 w-4 shrink-0" />
                Import template
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                }}
              />
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm"
                  disabled={importing || schemaMissing}
                  onClick={() => importFileRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4 shrink-0" />
                  {importing ? "Importing..." : "Import"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="col-span-2 h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:col-span-1 sm:text-sm"
                disabled={!rowsForExport.length}
                onClick={handleExport}
              >
                <Download className="mr-1 h-4 w-4 shrink-0" />
                {visitBulk.selectedCount > 0
                  ? `Export selected (${rowsForExport.length})`
                  : filtersActive
                    ? `Export filtered (${rowsForExport.length})`
                    : `Export${rowsForExport.length ? ` (${rowsForExport.length})` : ""}`}
              </Button>
            </div>
          ) : null}

          <TableSearchBar
            value={searchText}
            onChange={setSearchText}
            placeholder="Search college, location, contact, email..."
            showClear={filtersActive}
            onClear={clearTableFilters}
            hint={`Showing ${pageRows.length} of ${filteredVisits.length} college(s) | page ${page}/${totalPages}`}
          />

          {!pickForTask && visitBulk.selectedCount > 0 ? (
            <BulkSelectionBar selectedCount={visitBulk.selectedCount} onClear={visitBulk.clearSelection}>
              {isDbAdmin ? (
                <>
                  <select
                    className="h-8 rounded-lg border border-[#dbe6f3] bg-white px-2 text-xs"
                    value={bulkAssignTo}
                    onChange={(e) => setBulkAssignTo(e.target.value)}
                  >
                    <option value="">Assign as task to...</option>
                    {ownerOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-8 rounded-full bg-[#c9a227] text-white"
                    onClick={() => void handleBulkAssign()}
                    disabled={!bulkAssignTo || submitting}
                  >
                    Assign as College Visit task
                  </Button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-rose-200 text-rose-700"
                onClick={() => void handleBulkDelete()}
                disabled={submitting}
              >
                Delete
              </Button>
            </BulkSelectionBar>
          ) : null}

          <ResponsiveDataView
            stickyToolbar
            selectAll={
              !pickForTask
                ? {
                    checked: visitBulk.allSelected,
                    indeterminate: visitBulk.someSelected,
                    onChange: visitBulk.toggleAll,
                    label: "Select all",
                    countLabel: `${visitBulk.selectedCount} selected`,
                  }
                : undefined
            }
            desktop={
          <div className="responsive-table-wrap rounded-2xl border border-[#dbe6f3]">
            <table
              className="table-freeze-cols w-full min-w-[3000px]"
              style={
                {
                  ["--sticky-col-2" as string]: "14rem",
                  ["--sticky-check-w" as string]: "2.75rem",
                } as CSSProperties
              }
            >
              <thead className="cv-head bg-[#f8fbff]">
                <tr>
                  {pickForTask ? <TableHeaderCell label="Pick" className={TABLE_CHECK_TH} /> : null}
                  {!pickForTask ? (
                    <th className={TABLE_CHECK_TH}>
                      <div className="flex justify-center">
                        <TableBulkCheckbox
                          checked={visitBulk.allSelected}
                          indeterminate={visitBulk.someSelected}
                          onChange={visitBulk.toggleAll}
                          ariaLabel="Select all colleges"
                        />
                      </div>
                    </th>
                  ) : null}
                  <TableHeaderCell label="S.No" className={TABLE_SNO_TH} />
                  <TableHeaderCell label="College Name" className={`${thClass} min-w-[14rem]`} />
                  <TableHeaderCell label="Location" className={thClass} />
                  <TableHeaderCell label="Call" className={`${thClass} min-w-[5.5rem]`} />
                  <TableHeaderCell label="WhatsApp" className={`${thClass} min-w-[5.5rem]`} />
                  <TableHeaderCell label="Email" className={`${thClass} min-w-[5.5rem]`} />
                  <TableHeaderCell label="Connected Person Name" className={thClass} />
                  <TableHeaderCell label="Role" className={thClass} />
                  <TableHeaderFilter label="Visit Status" value={fltVisitStatus} options={VISIT_STATUSES.map((s) => ({ value: s, label: s }))} onChange={setFltVisitStatus} className={thClass} />
                  <TableHeaderCell label="Visit Date" className={thClass} />
                  <TableHeaderCell label="MOU Signed Status" className={thClass} />
                  <TableHeaderCell label="Follow-up Stage" className={thClass} />
                  <TableHeaderCell label="Last Follow-up Date" className={thClass} />
                  <TableHeaderCell label="Next Follow-up Date" className={thClass} />
                  <TableHeaderFilter label="Priority" value={fltPriority} options={COLLEGE_PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={setFltPriority} className={thClass} />
                  <TableHeaderFilter label="Owner" value={fltOwner} options={ownerOptions.map((o) => ({ value: o.id, label: o.label }))} onChange={setFltOwner} className={thClass} />
                  <TableHeaderCell label="Description" className={thClass} />
                  <TableHeaderCell label="Last Outcome / Remarks" className={thClass} />
                  <TableHeaderCell label="Days Since Last Follow-up" className={thClass} />
                  <TableHeaderFilter
                    label="Follow-up Due?"
                    value={fltFollowUpDue}
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                    onChange={setFltFollowUpDue}
                    className={thClass}
                  />
                  <TableHeaderCell label="Lead Score" className={thClass} />
                  <TableHeaderFilter label="Final Status" value={fltFinalStatus} options={FINAL_STATUSES.map((s) => ({ value: s, label: s }))} onChange={setFltFinalStatus} className={thClass} />
                  <TableHeaderCell label="Source / Reference" className={thClass} />
                  {!pickForTask ? <TableHeaderCell label="Actions" className={thClass} /> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={25} className="px-4 py-8 text-center text-sm text-[#64748b]">
                      Loading...
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={25} className="px-4 py-8 text-center text-sm text-[#64748b]">
                      No college visits found.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, idx) => {
                    const days = daysSince(row.last_follow_up_date);
                    const due = isFollowUpDue(row);
                    const phone = primaryOutreachPhone(row);
                    const flags = outreachDone[row.id] ?? {};
                    const person = row.connected_person_name || row.contacts?.find((c) => c.is_primary)?.name || "-";
                    const personRole = row.connected_person_role || row.contacts?.find((c) => c.is_primary)?.role || "";
                    return (
                      <tr key={row.id} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                        {pickForTask ? (
                          <td className={TABLE_CHECK_TD}>
                            <div className="flex justify-center">
                              <TableBulkCheckbox
                                checked={pickedCollegeIds.has(row.id)}
                                onChange={() => togglePickCollege(row.id)}
                                ariaLabel={`Pick ${row.college_name}`}
                              />
                            </div>
                          </td>
                        ) : null}
                        {!pickForTask ? (
                          <td className={TABLE_CHECK_TD}>
                            <div className="flex justify-center">
                              <TableBulkCheckbox
                                checked={visitBulk.isSelected(row.id)}
                                onChange={() => visitBulk.toggleOne(row.id)}
                                ariaLabel={`Select ${row.college_name}`}
                              />
                            </div>
                          </td>
                        ) : null}
                        <td className={TABLE_SNO_TD}>{(page - 1) * pageSize + idx + 1}</td>
                        <td className={`${tdClass} min-w-[14rem] max-w-[18rem] truncate font-medium`} title={row.college_name}>
                          {row.college_name}
                        </td>
                        <td className={tdClass}>{row.location || "-"}</td>
                        <td className={`${tdClass} min-w-[5.5rem]`}>
                          <StudentOutreachButtons
                            mode="phone"
                            phone={phone}
                            phoneCalled={flags.phoneCalled}
                            onPhoneClick={() => requestCollegePhone(row)}
                          />
                        </td>
                        <td className={`${tdClass} min-w-[5.5rem]`}>
                          <StudentOutreachButtons
                            mode="whatsapp"
                            phone={phone}
                            whatsapp={phone}
                            whatsappSent={flags.whatsappSent}
                            onWhatsAppClick={() => requestCollegeWhatsApp(row)}
                          />
                        </td>
                        <td className={`${tdClass} min-w-[5.5rem]`}>
                          <StudentOutreachButtons
                            mode="email"
                            email={row.email || collegeOutreachTargets(row).find((t) => t.email)?.email}
                            emailSent={flags.emailSent}
                            onEmailClick={() => requestCollegeEmail(row)}
                          />
                        </td>
                        <td className={`${tdClass} min-w-[12rem]`}>{person}</td>
                        <td className={tdClass}>{row.connected_person_role || personRole || "-"}</td>
                        <td className={tdClass}>{row.visit_status}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.visit_date)}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{row.mou_signed_status}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{row.follow_up_stage || "-"}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.last_follow_up_date)}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.next_follow_up_date)}</td>
                        <td className={tdClass}>{row.priority}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-"}</td>
                        <td className={`${tdClass} min-w-[14rem] max-w-[18rem] truncate`} title={row.description ?? ""}>
                          {row.description || "-"}
                        </td>
                        <td className={`${tdClass} min-w-[14rem] max-w-[18rem] truncate`} title={row.last_outcome_remarks ?? ""}>
                          {row.last_outcome_remarks || "-"}
                        </td>
                        <td className={`${tdClass} min-w-[12rem]`}>{days != null ? days : "-"}</td>
                        <td className={tdClass}>
                          <span
                            className={
                              due
                                ? "inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                                : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                            }
                          >
                            {due ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className={tdClass}>{row.lead_score}</td>
                        <td className={tdClass}>{row.final_status}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{row.source_reference || "-"}</td>
                        {!pickForTask ? (
                          <td className={`${tdClass} min-w-[11rem]`}>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => setViewVisit(row)}>
                                Activity
                              </Button>
                              {isAdmin ? (
                                <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => openEdit(row)}>
                                  Edit
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
            }
            mobile={
              loading ? (
                <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">Loading...</p>
              ) : pageRows.length === 0 ? (
                <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">No college visits found.</p>
              ) : (
                pageRows.map((row, idx) => {
                  const days = daysSince(row.last_follow_up_date);
                  const due = isFollowUpDue(row);
                  const person = row.connected_person_name || row.contacts?.find((c) => c.is_primary)?.name || "—";
                  const personRole = row.connected_person_role || row.contacts?.find((c) => c.is_primary)?.role || "";
                  return (
                    <MobileRecordCard
                      key={row.id}
                      title={row.college_name}
                      subtitle={`#${(page - 1) * pageSize + idx + 1}${row.location ? ` · ${row.location}` : ""}`}
                      showSelect={!pickForTask || pickForTask}
                      selected={pickForTask ? pickedCollegeIds.has(row.id) : visitBulk.isSelected(row.id)}
                      onToggleSelect={() => (pickForTask ? togglePickCollege(row.id) : visitBulk.toggleOne(row.id))}
                      selectAriaLabel={`${pickForTask ? "Pick" : "Select"} ${row.college_name}`}
                      previewFields={[
                        { label: "Location", value: dash(row.location) },
                        { label: "Contact person", value: person },
                        { label: "Follow-up stage", value: dash(row.follow_up_stage) },
                        { label: "Next follow-up", value: formatDisplayDate(row.next_follow_up_date) || "—" },
                        { label: "Final status", value: dash(row.final_status) },
                        { label: "Priority", value: dash(row.priority) },
                        { label: "Lead score", value: dash(row.lead_score) },
                        { label: "Proposal status", value: dash(row.proposal_status) },
                      ]}
                      detailFields={[
                        { label: "College Name", value: row.college_name },
                        { label: "Location", value: dash(row.location) },
                        { label: "Contact Number", value: dash(row.contact_number) },
                        { label: "Email", value: dash(row.email) },
                        { label: "Contact Person", value: person },
                        { label: "Role", value: dash(personRole || row.connected_person_role) },
                        { label: "Visit Status", value: dash(row.visit_status) },
                        { label: "Visit Date", value: formatDisplayDate(row.visit_date) || "—" },
                        { label: "MOU Signed Status", value: dash(row.mou_signed_status) },
                        { label: "Follow-up Stage", value: dash(row.follow_up_stage) },
                        { label: "Last Follow-up Date", value: formatDisplayDate(row.last_follow_up_date) || "—" },
                        { label: "Next Follow-up Date", value: formatDisplayDate(row.next_follow_up_date) || "—" },
                        { label: "Priority", value: dash(row.priority) },
                        { label: "Owner", value: row.assigned_to ? ownerNameMap[row.assigned_to] || "—" : "—" },
                        { label: "Description", value: dash(row.description), clamp: true },
                        { label: "Last Outcome / Remarks", value: dash(row.last_outcome_remarks), clamp: true },
                        { label: "Days Since Last Follow-up", value: days != null ? String(days) : "—" },
                        { label: "Follow-up Due?", value: due ? "Yes" : "No" },
                        { label: "Lead Score", value: dash(row.lead_score) },
                        { label: "Final Status", value: dash(row.final_status) },
                        { label: "Source / Reference", value: dash(row.source_reference) },
                        { label: "Proposal Status", value: dash(row.proposal_status) },
                        { label: "Proposal Amount", value: row.proposal_amount != null ? `₹${Number(row.proposal_amount).toLocaleString()}` : "—" },
                        { label: "Proposal Sent Date", value: formatDisplayDate(row.proposal_sent_date) || "—" },
                      ]}
                      primaryActions={
                        pickForTask
                          ? []
                          : [
                              { label: "View", onClick: () => setViewVisit(row) },
                              ...(isAdmin ? [{ label: "Edit", onClick: () => openEdit(row) }] : []),
                            ]
                      }
                      moreActions={
                        pickForTask
                          ? []
                          : [
                              { label: "Activity", onClick: () => setViewVisit(row) },
                              { label: "Call", onClick: () => requestCollegePhone(row) },
                              { label: "WhatsApp", onClick: () => requestCollegeWhatsApp(row) },
                              { label: "Email", onClick: () => requestCollegeEmail(row) },
                            ]
                      }
                    />
                  );
                })
              )
            }
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : null}

      <CollegeVisitFormPanel
        open={panelOpen}
        title={editId ? "Edit college visit" : "Add college visit"}
        value={form}
        owners={ownerOptions}
        submitting={submitting}
        canAssign={false}
        onChange={setForm}
        onClose={() => setPanelOpen(false)}
        onSubmit={() => void handleSave()}
        proposalUploadSlot={
          <ProposalFileUpload
            entityType="college"
            entityId={editId}
            meta={proposalFileMeta}
            pendingFile={pendingProposalFile}
            onPendingFileChange={setPendingProposalFile}
            onMetaChange={setProposalFileMeta}
            disabled={submitting}
            onError={setError}
            onSuccess={setSuccess}
          />
        }
      />

      {proposalRow ? (
        <CollegeProposalEditModal
          row={proposalRow}
          draft={proposalDraft}
          setDraft={setProposalDraft}
          onClose={() => {
            setProposalRow(null);
            setPendingProposalFile(null);
          }}
          onSave={() => void handleProposalSave()}
          submitting={proposalSubmitting}
          proposalUploadSlot={
            <ProposalFileUpload
              entityType="college"
              entityId={proposalRow.id}
              meta={proposalFileMeta}
              pendingFile={pendingProposalFile}
              onPendingFileChange={setPendingProposalFile}
              onMetaChange={setProposalFileMeta}
              disabled={proposalSubmitting}
              onError={setError}
              onSuccess={setSuccess}
            />
          }
        />
      ) : null}

      {viewVisit ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setViewVisit(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#e8dcc8] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="font-semibold text-[#0f172a]">{viewVisit.college_name}</h3>
                <p className="text-xs text-[#64748b]">
                  {viewVisit.location || "No location"} | Owner: {viewVisit.assigned_to ? ownerNameMap[viewVisit.assigned_to] : "Unassigned"}
                </p>
              </div>
              <button type="button" className="rounded-full border px-2 py-1 text-sm" onClick={() => setViewVisit(null)}>
                x
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {isAdmin ? (
                  <Button size="sm" className="rounded-full bg-[#c9a227] text-white" onClick={() => openEdit(viewVisit)}>
                    Update visit
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={() => requestCollegePhone(viewVisit)}>
                  Call
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={() => requestCollegeWhatsApp(viewVisit)}>
                  WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={() => requestCollegeEmail(viewVisit)}>
                  Email
                </Button>
                <Button size="sm" variant="outline" className="rounded-full border-rose-200 text-rose-700" onClick={() => void handleDelete(viewVisit.id)}>
                  Delete
                </Button>
              </div>
              <div className="mb-4 space-y-1 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3 text-xs text-[#64748b]">
                <p>
                  <span className="font-semibold text-[#3d3428]">Contact:</span> {viewVisit.contact_number || "-"}
                </p>
                <p>
                  <span className="font-semibold text-[#3d3428]">Email:</span> {viewVisit.email || "-"}
                </p>
              </div>
              <p className="mb-2 text-xs font-semibold uppercase text-[#94a3b8]">Activity timeline</p>
              <div className="space-y-2">
                {activities.length === 0 ? (
                  <p className="text-sm text-[#64748b]">No activity yet.</p>
                ) : (
                  activities.map((a) => (
                    <div key={a.id} className="rounded-lg border border-[#eef2f7] bg-[#f8fbff] p-3 text-xs">
                      <p className="font-semibold text-[#0f172a]">{a.activity_type}</p>
                      {a.notes ? <p className="mt-1 text-[#475569]">{a.notes}</p> : null}
                      {a.old_value || a.new_value ? (
                        <p className="mt-1 text-[#64748b]">
                          {a.old_value ?? "-"} {"->"} {a.new_value ?? "-"}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[#94a3b8]">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </>
      ) : null}
      {whatsAppComposeVisit ? (
        <WhatsAppComposeModal
          open={Boolean(whatsAppComposeVisit)}
          leadName={whatsAppComposeVisit.college_name}
          phone={whatsAppTargetPhone || primaryOutreachPhone(whatsAppComposeVisit)}
          templates={whatsAppTemplates}
          submitting={whatsAppSubmitting}
          onClose={() => {
            if (!whatsAppSubmitting) {
              setWhatsAppComposeVisit(null);
              setWhatsAppTargetPhone("");
            }
          }}
          onSend={(message) => void handleCollegeWhatsAppSend(message)}
        />
      ) : null}

      {emailComposeVisit ? (
        <EmailComposeModal
          open={Boolean(emailComposeVisit)}
          leadName={
            emailComposeTarget?.personLabel
              ? `${emailComposeVisit.college_name} · ${emailComposeTarget.personLabel}`
              : emailComposeVisit.college_name
          }
          email={emailComposeTarget?.email?.trim() || emailComposeVisit.email?.trim() || ""}
          templates={[]}
          submitting={emailSubmitting}
          onClose={() => {
            if (!emailSubmitting) {
              setEmailComposeVisit(null);
              setEmailComposeTarget(null);
            }
          }}
          onSend={(message) => void handleCollegeEmailSend(message)}
        />
      ) : null}

      {outreachPicker ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[60] bg-slate-900/40"
            onClick={() => setOutreachPicker(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[#3d3428]">
              {outreachPicker.mode === "phone"
                ? "Choose number to call"
                : outreachPicker.mode === "whatsapp"
                  ? "Choose WhatsApp number"
                  : "Choose email"}
            </h3>
            <p className="mt-1 text-xs text-[#6b5d4d]">{outreachPicker.row.college_name}</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {outreachPicker.targets.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="flex w-full flex-col rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2.5 text-left transition hover:border-[#c9a227] hover:bg-[#faf3e3]"
                  onClick={() => {
                    if (outreachPicker.mode === "phone") void handleCollegePhoneClick(outreachPicker.row, t.phone);
                    else if (outreachPicker.mode === "whatsapp") openCollegeWhatsAppCompose(outreachPicker.row, t.phone);
                    else openCollegeEmailCompose(outreachPicker.row, t);
                  }}
                >
                  <span className="text-sm font-semibold text-[#3d3428]">
                    {t.personLabel}
                    {t.role ? ` · ${t.role}` : ""}
                  </span>
                  <span className="text-xs text-[#6b5d4d]">
                    {outreachPicker.mode === "email" ? t.email : t.phone}
                  </span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl border-[#e8dcc8]"
              onClick={() => setOutreachPicker(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
