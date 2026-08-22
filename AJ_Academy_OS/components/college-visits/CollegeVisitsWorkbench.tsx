"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Plus, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { formatDisplayDate } from "@/lib/datetime";
import { saveTaskCollegeSelection } from "@/lib/taskLeadPickStorage";
import { resolveTaskAssignment } from "@/lib/taskAssignmentDedupe";
import { deleteOwnedCollegeVisits } from "@/lib/crmOwnedDelete";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import type { EmailComposeSubmitPayload } from "@/components/shared/EmailComposeModal";
import { LeadActivityModal, type LeadActivityItem } from "@/components/shared/LeadActivityModal";
import {
  fetchWhatsAppTemplates,
  formatEmailActivityNotes,
  formatWhatsAppActivityNotes,
  MAX_EMAIL_MESSAGE_LENGTH,
  MAX_WHATSAPP_MESSAGE_LENGTH,
} from "@/lib/whatsappOutreach";
import { navigateWithoutAppPopup } from "@/lib/browser/sameWindowDownload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrmFlash } from "@/components/ui/CrmFlash";
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
  CollegeVisitImportBatchRowList,
  type CollegeImportBatchRow,
} from "@/components/college-visits/CollegeVisitImportBatchRowList";
import {
  CollegeCallOutcomeModal,
  CollegePendingCallBanner,
  type CollegePendingCall,
} from "@/components/college-visits/CollegeCallOutcomeModal";
import {
  downloadCollegeVisitImportTemplate,
  exportCollegeVisitsCsv,
} from "@/components/college-visits/collegeVisitsCsv";
import {
  COLLEGE_PRIORITIES,
  CV_TAB_IDS,
  CV_TAB_LABELS,
  type CvTabId,
} from "@/components/college-visits/collegeVisitsConfig";
import {
  defaultCollegeVisitSettingsLists,
  fetchCollegeVisitSettingsLists,
  persistCollegeVisitSettingsLists,
  type CollegeVisitSettingsLists,
} from "@/lib/collegeVisitSettings";
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
  legacyCollegeVisitGroupKey,
  LEGACY_ALL_COLLEGES_BATCH_KEY,
  primaryOutreachPhone,
  collegeOutreachTargets,
  collegeOutreachTargetsForContact,
  collegeOutreachTargetLabel,
  collegeContactsForRow,
  contactRoleSelectLabel,
  selectedCollegeContact,
  shouldShowCollegeOutreachPicker,
  anyCollegeOutreachPhone,
  anyCollegeOutreachEmail,
  type CollegeOutreachTarget,
  type CollegeVisitActivityRow,
  type CollegeVisitFormValue,
  type CollegeVisitRow,
} from "@/components/college-visits/collegeVisitsHelpers";
import { parseOutcomeRemarkEntries } from "@/lib/outcomeRemarks";
import { ProposalFileUpload, uploadProposalFile } from "@/components/shared/ProposalFileUpload";
import type { ProposalFileMeta, ProposalStoredFile } from "@/lib/proposalFiles";

type CollegeOutreachFlags = {
  phoneCalled?: boolean;
  whatsappSent?: boolean;
  emailSent?: boolean;
};

type OutreachPickerState =
  | { mode: "phone"; row: CollegeVisitRow; targets: CollegeOutreachTarget[] }
  | { mode: "whatsapp"; row: CollegeVisitRow; targets: CollegeOutreachTarget[] }
  | { mode: "email"; row: CollegeVisitRow; targets: CollegeOutreachTarget[] };

type EmailProviderPickerState = {
  row: CollegeVisitRow;
  target: CollegeOutreachTarget | null;
};

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
  const [cvRefreshing, setCvRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const cvRefreshSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

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
  const [activityVisit, setActivityVisit] = useState<CollegeVisitRow | null>(null);
  const [activityModalRows, setActivityModalRows] = useState<LeadActivityItem[]>([]);
  const [activityModalLoading, setActivityModalLoading] = useState(false);
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
  const [pendingProposalFiles, setPendingProposalFiles] = useState<File[]>([]);
  const [proposalFiles, setProposalFiles] = useState<ProposalStoredFile[]>([]);
  const [editingOutcomeHistory, setEditingOutcomeHistory] = useState<string | null>(null);
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
  const [importBatches, setImportBatches] = useState<CollegeImportBatchRow[]>([]);
  const [importBatchesLoading, setImportBatchesLoading] = useState(false);
  const [focusedImportBatch, setFocusedImportBatch] = useState<CollegeImportBatchRow | null>(null);
  const [batchImportExecuting, setBatchImportExecuting] = useState(false);
  const [outreachDone, setOutreachDone] = useState<Record<string, CollegeOutreachFlags>>({});
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<string[]>([]);
  const [cvLists, setCvLists] = useState<CollegeVisitSettingsLists>(() => defaultCollegeVisitSettingsLists());
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [whatsAppComposeVisit, setWhatsAppComposeVisit] = useState<CollegeVisitRow | null>(null);
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);
  const [emailComposeVisit, setEmailComposeVisit] = useState<CollegeVisitRow | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailComposeTarget, setEmailComposeTarget] = useState<CollegeOutreachTarget | null>(null);
  const [emailComposeProvider, setEmailComposeProvider] = useState<"zoho" | "gmail">("zoho");
  const [emailProviderPicker, setEmailProviderPicker] = useState<EmailProviderPickerState | null>(null);
  const [outreachPicker, setOutreachPicker] = useState<OutreachPickerState | null>(null);
  const [whatsAppTargetPhone, setWhatsAppTargetPhone] = useState("");
  /** Role-column selection: which contact Call / WhatsApp / Email should use. */
  const [selectedOutreachContactByVisit, setSelectedOutreachContactByVisit] = useState<Record<string, string>>({});
  const [pendingCollegeCall, setPendingCollegeCall] = useState<CollegePendingCall | null>(null);
  const [collegeCallOutcomeOpen, setCollegeCallOutcomeOpen] = useState(false);
  const [collegeCallOutcomeSubmitting, setCollegeCallOutcomeSubmitting] = useState(false);

  const loadProposalFiles = useCallback(async (entityType: "student" | "college", entityId: string) => {
    try {
      const res = await fetch("/api/proposals/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      const json = (await res.json()) as { files?: ProposalStoredFile[] };
      if (res.ok) setProposalFiles(json.files ?? []);
      else setProposalFiles([]);
    } catch {
      setProposalFiles([]);
    }
  }, []);

  const setVisitOutreachContact = useCallback((visitId: string, contactId: string) => {
    setSelectedOutreachContactByVisit((prev) => ({ ...prev, [visitId]: contactId }));
  }, []);

  const outreachContactIdFor = useCallback(
    (row: CollegeVisitRow) => {
      const contacts = collegeContactsForRow(row);
      const saved = selectedOutreachContactByVisit[row.id];
      if (saved && contacts.some((c) => c.id === saved)) return saved;
      return selectedCollegeContact(row)?.id ?? contacts[0]?.id ?? "";
    },
    [selectedOutreachContactByVisit],
  );

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
    const json = (await res.json()) as { visits?: CollegeVisitRow[]; pinIds?: string[]; error?: string };
    if (!res.ok) {
      const msg = json.error ?? "Could not load college visits.";
      if (isMissingCollegeVisitsTable(msg)) {
        setSchemaMissing(true);
        // Do not clear existing visits on schema/transient errors during refresh.
        if (!hasLoadedOnceRef.current) setVisits([]);
        return;
      }
      throw new Error(msg);
    }
    setSchemaMissing(false);
    setVisits(json.visits ?? []);
  }, []);

  const loadImportBatches = useCallback(async () => {
    if (!isDbAdmin) return;
    setImportBatchesLoading(true);
    try {
      const res = await fetch("/api/college-visits/import", { credentials: "include" });
      const json = (await res.json()) as { batches?: CollegeImportBatchRow[]; hint?: string };
      if (res.ok) setImportBatches(json.batches ?? []);
    } finally {
      setImportBatchesLoading(false);
    }
  }, [isDbAdmin]);

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
    const isInitial = !hasLoadedOnceRef.current;
    setError(null);
    setRefreshError(null);
    if (isInitial) setLoading(true);
    else setCvRefreshing(true);
    try {
      const lists = await fetchCollegeVisitSettingsLists(supabase);
      setCvLists(lists);
      await loadVisits();
      if (isDbAdmin) await loadImportBatches();
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    } catch (e) {
      if (isInitial) setError(friendlyCollegeVisitError(e));
      else setRefreshError("Unable to refresh. Showing the latest available data.");
    } finally {
      if (isInitial) setLoading(false);
      else setCvRefreshing(false);
    }
  }, [currentUserId, isDbAdmin, loadImportBatches, loadVisits, supabase]);

  /** Background refetch — keep current visits visible until a valid response arrives. */
  const silentRefreshVisits = useCallback(async () => {
    if (!currentUserId) return;
    const seq = ++cvRefreshSeqRef.current;
    setCvRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/college-visits");
      const json = (await res.json()) as { visits?: CollegeVisitRow[]; error?: string };
      if (seq !== cvRefreshSeqRef.current) return;
      if (!res.ok) {
        const msg = json.error ?? "Could not load college visits.";
        if (isMissingCollegeVisitsTable(msg)) {
          setSchemaMissing(true);
          return;
        }
        throw new Error(msg);
      }
      setSchemaMissing(false);
      setVisits(json.visits ?? []);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    } catch (e) {
      if (seq !== cvRefreshSeqRef.current) return;
      setRefreshError("Unable to refresh. Showing the latest available data.");
      console.error("[CollegeVisits] silentRefreshVisits", e);
    } finally {
      if (seq === cvRefreshSeqRef.current) setCvRefreshing(false);
    }
  }, [currentUserId]);

  const scheduleSilentRefreshVisits = useDebouncedCallback(() => {
    void silentRefreshVisits();
  }, 400);

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
    async (row: CollegeVisitRow, phoneOverride?: string, targetLabel?: string) => {
      const phone = (phoneOverride || primaryOutreachPhone(row)).trim();
      if (!phone) {
        setError("No contact number on this college.");
        return;
      }
      setError(null);
      setOutreachPicker(null);
      markOutreach(row.id, { phoneCalled: true });
      window.location.href = `tel:${phone}`;
      const pending: CollegePendingCall = {
        visit: row,
        phone,
        targetLabel: targetLabel?.trim() || undefined,
        startedAt: new Date().toISOString(),
      };
      setPendingCollegeCall(pending);
      setCollegeCallOutcomeOpen(true);
      try {
        const who = targetLabel?.trim() ? ` (${targetLabel.trim()})` : "";
        await logCollegeActivity(row.id, "Phone Call", `Called ${phone}${who}`);
        setSuccess("Call started — please update the call outcome and status.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not log call.");
      }
    },
    [logCollegeActivity, markOutreach],
  );

  const submitCollegeCallOutcome = useCallback(
    async (payload: {
      visitId: string;
      callOutcome: string;
      notes: string;
      visitStatus: string;
      followUpStage: string;
      finalStatus: string;
      priority: string;
      nextFollowUpDate: string;
      scheduleFollowUp: boolean;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!currentUserId) return { ok: false, error: "Not signed in." };
      const row =
        visits.find((v) => v.id === payload.visitId) ||
        (pendingCollegeCall?.visit.id === payload.visitId ? pendingCollegeCall.visit : null);
      if (!row) return { ok: false, error: "College visit not found. Refresh and try again." };

      setCollegeCallOutcomeSubmitting(true);
      setError(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const remarkLine = `Call: ${payload.callOutcome} — ${payload.notes}`;
        const formRow = {
          ...collegeVisitRowToForm(row),
          visit_status: payload.visitStatus,
          follow_up_stage: payload.followUpStage,
          final_status: payload.finalStatus || row.final_status || "Open",
          priority: payload.priority || row.priority || "Warm",
          last_follow_up_date: today,
          next_follow_up_date: payload.scheduleFollowUp ? payload.nextFollowUpDate : row.next_follow_up_date?.slice(0, 10) || "",
          last_outcome_remarks: remarkLine,
        };
        const built = buildCollegeVisitPayload(formRow, { userId: currentUserId, isDbAdmin });
        const res = await fetch(`/api/college-visits/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formRow, assigned_to: built.assigned_to ?? "" }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not save call outcome.");

        await logCollegeActivity(
          row.id,
          "Call Outcome",
          [
            payload.callOutcome,
            payload.notes,
            `Visit status: ${payload.visitStatus}`,
            payload.followUpStage ? `Follow-up stage: ${payload.followUpStage}` : null,
            payload.scheduleFollowUp && payload.nextFollowUpDate
              ? `Next follow-up: ${payload.nextFollowUpDate}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );

        setPendingCollegeCall(null);
        setCollegeCallOutcomeOpen(false);
        setSuccess(`Call outcome saved — ${payload.callOutcome}`);
        await silentRefreshVisits();
        return { ok: true };
      } catch (e) {
        const msg = friendlyCollegeVisitError(e);
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setCollegeCallOutcomeSubmitting(false);
      }
    },
    [currentUserId, visits, pendingCollegeCall, isDbAdmin, logCollegeActivity, silentRefreshVisits],
  );

  const requestCollegePhone = useCallback(
    (row: CollegeVisitRow) => {
      const contactId = outreachContactIdFor(row);
      const phoneTargets = collegeOutreachTargetsForContact(row, contactId, "phone");
      if (phoneTargets.length === 0) {
        setError("No contact number for the selected role. Add a phone on that contact, or pick another role.");
        return;
      }
      if (!shouldShowCollegeOutreachPicker(phoneTargets)) {
        void handleCollegePhoneClick(row, phoneTargets[0].phone, collegeOutreachTargetLabel(phoneTargets[0]));
        return;
      }
      setOutreachPicker({ mode: "phone", row, targets: phoneTargets });
    },
    [handleCollegePhoneClick, outreachContactIdFor],
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
      const contactId = outreachContactIdFor(row);
      const phoneTargets = collegeOutreachTargetsForContact(row, contactId, "phone");
      if (phoneTargets.length === 0) {
        setError("No WhatsApp number for the selected role. Add a phone on that contact, or pick another role.");
        return;
      }
      if (!shouldShowCollegeOutreachPicker(phoneTargets)) {
        openCollegeWhatsAppCompose(row, phoneTargets[0].phone);
        return;
      }
      setOutreachPicker({ mode: "whatsapp", row, targets: phoneTargets });
    },
    [openCollegeWhatsAppCompose, outreachContactIdFor],
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
      navigateWithoutAppPopup(wa);

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

  const openCollegeEmailCompose = useCallback(
    (row: CollegeVisitRow, target?: CollegeOutreachTarget, provider: "zoho" | "gmail" = "zoho") => {
      const email = (target?.email || row.email || "").trim();
      if (!email) {
        const withEmail = collegeOutreachTargets(row).find((t) => t.email.trim());
        if (!withEmail?.email) {
          setError("No email address on this college.");
          return;
        }
        setEmailComposeTarget(withEmail);
        setEmailComposeProvider(provider);
        setEmailComposeVisit(row);
        setError(null);
        setOutreachPicker(null);
        setEmailProviderPicker(null);
        return;
      }
      setError(null);
      setOutreachPicker(null);
      setEmailProviderPicker(null);
      setEmailComposeProvider(provider);
      setEmailComposeTarget(
        target ?? {
          key: "primary",
          contactId: "",
          personLabel: row.connected_person_name || "Contact",
          role: row.connected_person_role || "",
          phone: "",
          email,
        },
      );
      setEmailComposeVisit(row);
    },
    [],
  );

  const requestEmailProviderPicker = useCallback((row: CollegeVisitRow, target?: CollegeOutreachTarget | null) => {
    setOutreachPicker(null);
    setError(null);
    setEmailProviderPicker({ row, target: target ?? null });
  }, []);

  const requestCollegeEmail = useCallback(
    (row: CollegeVisitRow) => {
      const contactId = outreachContactIdFor(row);
      const uniq = collegeOutreachTargetsForContact(row, contactId, "email");
      if (uniq.length === 0) {
        setError("No email for the selected role. Add an email on that contact, or pick another role.");
        return;
      }
      if (!shouldShowCollegeOutreachPicker(uniq)) {
        requestEmailProviderPicker(row, uniq[0]);
        return;
      }
      setOutreachPicker({ mode: "email", row, targets: uniq });
    },
    [outreachContactIdFor, requestEmailProviderPicker],
  );

  const handleCollegeEmailSend = useCallback(
    async (payload: EmailComposeSubmitPayload) => {
      if (!emailComposeVisit) return;
      const email = (payload.to || emailComposeTarget?.email || emailComposeVisit.email || "").trim();
      if (!email) {
        setError("No email address on this college.");
        return;
      }
      const trimmed = payload.message.trim();
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
      const subject = payload.subject.trim();

      try {
        const mailRes = await fetch("/api/outreach/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: payload.provider,
            to: email,
            cc: payload.cc,
            subject,
            body: trimmed,
            attachments: payload.attachments,
          }),
        });
        const mailPayload = (await mailRes.json().catch(() => ({}))) as { error?: string; from?: string };
        if (!mailRes.ok) {
          setError(mailPayload.error || "Could not send email.");
          setEmailSubmitting(false);
          return;
        }

        markOutreach(emailComposeVisit.id, { emailSent: true });
        await logCollegeActivity(
          emailComposeVisit.id,
          "Email",
          formatEmailActivityNotes(trimmed, {
            provider: payload.provider,
            from: mailPayload.from,
            to: email,
            cc: payload.cc,
            subject,
          }),
        );
        setEmailComposeVisit(null);
        setEmailComposeTarget(null);
        setSuccess(
          `Email sent via ${payload.provider === "zoho" ? "Zoho" : "Gmail"} and logged to activity (visible to admin & employee).`,
        );
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
    if (!currentUserId) return;
    const ch = supabase
      .channel("college-visits-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "college_visits" }, () => scheduleSilentRefreshVisits())
      .on("postgres_changes", { event: "*", schema: "public", table: "college_visit_activities" }, () =>
        scheduleSilentRefreshVisits(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [currentUserId, scheduleSilentRefreshVisits, supabase]);

  useEffect(() => {
    if (pickForTask) setActiveTab("all-colleges");
  }, [pickForTask]);

  useEffect(() => {
    if (isEmployeePortal && (activeTab === "reports" || activeTab === "settings")) {
      setActiveTab("overview");
    }
  }, [activeTab, isEmployeePortal]);

  const openCollegeActivity = async (row: CollegeVisitRow) => {
    setActivityVisit(row);
    setActivityModalLoading(true);
    setActivityModalRows([]);
    try {
      const res = await fetch(`/api/college-visits/${row.id}/activities`);
      const json = (await res.json()) as { activities?: CollegeVisitActivityRow[]; error?: string };
      if (!res.ok) {
        setError(json.error || "Could not load activity.");
        setActivityModalRows([]);
      } else {
        setActivityModalRows(
          (json.activities ?? []).map((a) => ({
            id: a.id,
            activity_type: a.activity_type ?? null,
            notes: a.notes ?? null,
            old_value: a.old_value ?? null,
            new_value: a.new_value ?? null,
            created_at: a.created_at,
            created_by: a.created_by ?? null,
          })),
        );
      }
    } catch {
      setError("Could not load activity.");
    } finally {
      setActivityModalLoading(false);
    }
  };

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
        `${v.college_name} ${v.location ?? ""} ${v.contact_number ?? ""} ${v.email ?? ""} ${v.connected_person_name ?? ""} ${v.source_reference ?? ""} ${v.visit_status ?? ""} ${v.mou_signed_status ?? ""} ${v.final_status ?? ""} ${v.priority ?? ""} ${v.follow_up_stage ?? ""} ${v.proposal_status ?? ""} ${v.visited_by_name ?? ""}`
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

  /** Overview uses the same search + filters as other subsections. */
  const trackerVisits = useMemo(() => filteredVisits, [filteredVisits]);

  const filtersActive = Boolean(
    searchText.trim() || fltVisitStatus || fltPriority || fltOwner || fltFinalStatus || fltFollowUpDue,
  );

  const syntheticLegacyBatches = useMemo((): CollegeImportBatchRow[] => {
    const legacy = visits.filter((v) => !v.import_batch_id);
    if (!legacy.length) return [];
    const latest = legacy.reduce(
      (max, row) => ((row.created_at || "") > max ? row.created_at : max),
      legacy[0]?.created_at ?? "",
    );
    return [
      {
        id: `legacy:${LEGACY_ALL_COLLEGES_BATCH_KEY}`,
        isLegacy: true,
        legacyGroupKey: LEGACY_ALL_COLLEGES_BATCH_KEY,
        batch_number: "ALL",
        file_name: "All Colleges",
        row_count: legacy.length,
        new_count: legacy.length,
        duplicate_count: 0,
        invalid_count: 0,
        created_count: legacy.length,
        skipped_count: 0,
        failed_count: 0,
        status: "completed",
        uploaded_at: latest,
      },
    ];
  }, [visits]);

  const displayImportBatches = useMemo(() => {
    return [...importBatches, ...syntheticLegacyBatches].sort((a, b) =>
      (b.uploaded_at || "").localeCompare(a.uploaded_at || ""),
    );
  }, [importBatches, syntheticLegacyBatches]);

  const visitsForFocusedBatch = useMemo(() => {
    if (!focusedImportBatch) return [];
    if (focusedImportBatch.legacyGroupKey) {
      if (focusedImportBatch.legacyGroupKey === LEGACY_ALL_COLLEGES_BATCH_KEY) {
        return visits.filter((v) => !v.import_batch_id);
      }
      return visits.filter(
        (v) => !v.import_batch_id && legacyCollegeVisitGroupKey(v) === focusedImportBatch.legacyGroupKey,
      );
    }
    return visits.filter((v) => v.import_batch_id === focusedImportBatch.id);
  }, [focusedImportBatch, visits]);

  const showImportBatchList = isDbAdmin && !pickForTask && activeTab === "all-colleges";

  const allCollegesTableVisits = useMemo(() => {
    if (activeTab !== "all-colleges") return filteredVisits;
    if (showImportBatchList && !focusedImportBatch) return [];
    const base = focusedImportBatch ? visitsForFocusedBatch : visits;
    let list = [...base];
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        `${v.college_name} ${v.location ?? ""} ${v.contact_number ?? ""} ${v.email ?? ""} ${v.connected_person_name ?? ""} ${v.source_reference ?? ""} ${v.visit_status ?? ""} ${v.mou_signed_status ?? ""} ${v.final_status ?? ""} ${v.priority ?? ""} ${v.follow_up_stage ?? ""} ${v.proposal_status ?? ""} ${v.visited_by_name ?? ""}`
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
  }, [
    activeTab,
    filteredVisits,
    fltFinalStatus,
    fltFollowUpDue,
    fltOwner,
    fltPriority,
    fltVisitStatus,
    focusedImportBatch,
    searchText,
    showImportBatchList,
    visits,
    visitsForFocusedBatch,
  ]);

  const batchAwaitingImport =
    Boolean(focusedImportBatch && !focusedImportBatch.isLegacy && focusedImportBatch.status === "ready_for_review");

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
  } = usePagination(activeTab === "all-colleges" ? allCollegesTableVisits : filteredVisits, 25);

  const {
    paginatedItems: paginatedImportBatches,
    page: importBatchPage,
    setPage: setImportBatchPage,
    totalPages: importBatchTotalPages,
    totalItems: importBatchTotalItems,
    pageSize: importBatchPageSize,
    setPageSize: setImportBatchPageSize,
  } = usePagination(displayImportBatches, 25);

  /** Select across the full filtered set (not only the current page). */
  const visitBulk = useRowSelection(
    activeTab === "all-colleges" ? allCollegesTableVisits : filteredVisits,
    (v) => v.id,
  );

  const batchBulk = useRowSelection(
    displayImportBatches,
    (b) => b.id,
    paginatedImportBatches,
  );

  useEffect(() => {
    visitBulk.clearSelection();
    batchBulk.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset selection on tab change
  }, [activeTab, pickForTask]);

  useEffect(() => {
    if (activeTab !== "timeline" || !filteredVisits.length) {
      if (activeTab !== "timeline") setTimelineRows([]);
      else if (!filteredVisits.length) setTimelineRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setTimelineLoading(true);
      try {
        const ids = filteredVisits.map((v) => v.id);
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
  }, [activeTab, filteredVisits, supabase]);

  const rowsForExport = useMemo(() => {
    const scope = activeTab === "all-colleges" ? allCollegesTableVisits : filteredVisits;
    if (visitBulk.selectedCount > 0) {
      return scope.filter((v) => visitBulk.selected.has(v.id));
    }
    return scope;
  }, [activeTab, allCollegesTableVisits, filteredVisits, visitBulk.selected, visitBulk.selectedCount]);

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
      await silentRefreshVisits();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPipeline = async (name: string) => {
    if (!isDbAdmin) throw new Error("Only admins can add pipeline stages.");
    setAddingPipeline(true);
    setError(null);
    try {
      const nextLists: CollegeVisitSettingsLists = {
        ...cvLists,
        visitStatuses: [...cvLists.visitStatuses, name],
      };
      const saved = await persistCollegeVisitSettingsLists(nextLists);
      setCvLists(saved);
      setSuccess(`Pipeline "${name}" added. New column and dropdown options are ready.`);
    } finally {
      setAddingPipeline(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyCollegeVisitForm(currentUserId));
    setEditingOutcomeHistory(null);
    setPendingProposalFiles([]);
    setProposalFiles([]);
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
    const nextForm = collegeVisitRowToForm(row);
    // Append-only outcome input: keep existing logs separate and keep input empty for new update.
    nextForm.last_outcome_remarks = "";
    setForm(nextForm);
    setEditingOutcomeHistory(row.last_outcome_remarks ?? null);
    setPendingProposalFiles([]);
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
    void loadProposalFiles("college", row.id);
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
    setPendingProposalFiles([]);
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
    void loadProposalFiles("college", row.id);
  };

  const handleProposalSave = async () => {
    if (!proposalRow || !currentUserId) return;
    setProposalSubmitting(true);
    setError(null);
    setSuccess(null);
    const filesToUpload = [...pendingProposalFiles];
    try {
      const base = collegeVisitRowToForm(proposalRow);
      const formRow: CollegeVisitFormValue = {
        ...base,
        // Do not resend full remark history — PATCH treats empty as "keep existing append-only log".
        last_outcome_remarks: "",
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
      if (filesToUpload.length) {
        for (const file of filesToUpload) {
          await uploadProposalFile({
            entityType: "college",
            entityId: proposalRow.id,
            file,
          });
        }
        setPendingProposalFiles([]);
        await loadProposalFiles("college", proposalRow.id);
      }
      setSuccess(filesToUpload.length ? `Proposal updated and ${filesToUpload.length} file(s) uploaded.` : "Proposal updated.");
      setProposalRow(null);
      await silentRefreshVisits();
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
    const filesToUpload = [...pendingProposalFiles];
    const editingId = editId;
    try {
      const payload = buildCollegeVisitPayload(form, { userId: currentUserId, isDbAdmin });
      if (editingId) {
        const res = await fetch(`/api/college-visits/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, assigned_to: payload.assigned_to ?? "" }),
        });
        const json = (await res.json()) as { visit?: CollegeVisitRow; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Update failed.");
        if (json.visit?.last_outcome_remarks != null) {
          setEditingOutcomeHistory(json.visit.last_outcome_remarks);
        }
        if (filesToUpload.length) {
          for (const file of filesToUpload) {
            const uploaded = await uploadProposalFile({
              entityType: "college",
              entityId: editingId,
              file,
            });
            setProposalFileMeta((m) => ({ ...m, ...uploaded }));
          }
          setPendingProposalFiles([]);
          await loadProposalFiles("college", editingId);
        }
        setSuccess(filesToUpload.length ? `College visit updated and ${filesToUpload.length} file(s) uploaded.` : "College visit updated.");
      } else {
        const res = await fetch("/api/college-visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            assigned_to: payload.assigned_to ?? "",
            ...(focusedImportBatch && !focusedImportBatch.isLegacy && !editingId
              ? { import_batch_id: focusedImportBatch.id }
              : {}),
          }),
        });
        const json = (await res.json()) as { visit?: { id?: string }; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Create failed.");
        const nid = json.visit?.id;
        if (nid && filesToUpload.length) {
          for (const file of filesToUpload) {
            const uploaded = await uploadProposalFile({
              entityType: "college",
              entityId: nid,
              file,
            });
            setProposalFileMeta((m) => ({ ...m, ...uploaded }));
          }
          setPendingProposalFiles([]);
          await loadProposalFiles("college", nid);
        }
        setSuccess(nid && filesToUpload.length ? `College visit created and ${filesToUpload.length} proposal file(s) uploaded.` : "College visit created.");
      }
      setPanelOpen(false);
      setEditId(null);
      setPendingProposalFiles([]);
      await silentRefreshVisits();
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
    await silentRefreshVisits();
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
      const resolved = await resolveTaskAssignment(supabase, {
        assigneeId: bulkAssignTo,
        assignmentType: "college",
        clientIds: [],
        collegeVisitIds: ids,
        projectId: null,
      });

      if (resolved.action === "skip") {
        visitBulk.clearSelection();
        setBulkAssignTo("");
        setSuccess(`${label} already has these college(s) on an active task.`);
        await silentRefreshVisits();
        return;
      }

      let taskId: string;
      if (resolved.action === "merge") {
        const { error: mergeError } = await supabase
          .from("tasks")
          .update({
            college_visit_ids: resolved.collegeVisitIds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resolved.taskId);
        if (mergeError) throw new Error(mergeError.message);
        taskId = resolved.taskId;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("tasks")
          .insert({
            title: `College visit outreach (${resolved.collegeVisitIds.length})`,
            description: `Assigned from College Visits | ${resolved.collegeVisitIds.length} linked college(s).`,
            assigned_to: bulkAssignTo,
            assigned_by: currentUserId,
            assignment_type: "college",
            client_ids: [],
            college_visit_ids: resolved.collegeVisitIds,
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
        if (!inserted?.id) throw new Error("Task was not created.");
        taskId = inserted.id;
      }

      try {
        await supabase.rpc("create_task_assignment_notification", { p_task_id: taskId });
      } catch {
        /* optional */
      }
      try {
        void fetch("/api/push/event", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "visit_assigned", taskId }),
        });
      } catch {
        /* ignore */
      }
      visitBulk.clearSelection();
      setBulkAssignTo("");
      setSuccess(
        resolved.action === "merge"
          ? `${resolved.addedCount} college(s) added to ${label}'s existing College Visit task.${
              resolved.skippedCount ? ` ${resolved.skippedCount} already linked.` : ""
            }`
          : `${resolved.collegeVisitIds.length} college(s) sent to ${label} as My Tasks -> College Visit.`,
      );
      await silentRefreshVisits();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDeleteBatches = async () => {
    if (!isDbAdmin || !currentUserId || batchBulk.selectedCount === 0) return;

    const selectedBatches = displayImportBatches.filter((b) => batchBulk.isSelected(b.id));
    if (!selectedBatches.length) return;

    const collegeIds = new Set<string>();
    const dbBatchIds: string[] = [];

    for (const batch of selectedBatches) {
      if (batch.isLegacy && batch.legacyGroupKey) {
        if (batch.legacyGroupKey === LEGACY_ALL_COLLEGES_BATCH_KEY) {
          for (const v of visits) {
            if (!v.import_batch_id) collegeIds.add(v.id);
          }
        } else {
          for (const v of visits) {
            if (!v.import_batch_id && legacyCollegeVisitGroupKey(v) === batch.legacyGroupKey) {
              collegeIds.add(v.id);
            }
          }
        }
      } else if (!batch.isLegacy) {
        dbBatchIds.push(batch.id);
        for (const v of visits) {
          if (v.import_batch_id === batch.id) collegeIds.add(v.id);
        }
      }
    }

    const collegeCount = collegeIds.size;
    const batchCount = selectedBatches.length;
    const confirmMsg =
      collegeCount > 0
        ? `Delete ${batchCount} selected upload${batchCount === 1 ? "" : "s"} and ${collegeCount} linked college visit${collegeCount === 1 ? "" : "s"}?`
        : `Delete ${batchCount} selected upload${batchCount === 1 ? "" : "s"}? Pending imports with no saved colleges will be removed.`;
    if (!confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      if (collegeIds.size) {
        const { deleted, error: deleteError } = await deleteOwnedCollegeVisits(
          supabase,
          [...collegeIds],
          currentUserId,
          { isAdmin: isDbAdmin },
        );
        if (deleteError) throw new Error(deleteError);
        if (!deleted) {
          throw new Error(
            "No college visits were deleted. Re-run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed.",
          );
        }
      }

      if (dbBatchIds.length) {
        const { error: batchError } = await supabase
          .from("college_visit_import_batches")
          .delete()
          .in("id", dbBatchIds);
        if (batchError) throw new Error(batchError.message);
      }

      if (focusedImportBatch && batchBulk.isSelected(focusedImportBatch.id)) {
        setFocusedImportBatch(null);
      }
      batchBulk.clearSelection();
      setSuccess(
        collegeCount
          ? `${batchCount} upload${batchCount === 1 ? "" : "s"} removed (${collegeCount} college visit${collegeCount === 1 ? "" : "s"} deleted).`
          : `${batchCount} upload${batchCount === 1 ? "" : "s"} removed.`,
      );
      await silentRefreshVisits();
      await loadImportBatches();
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
      await silentRefreshVisits();
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadCollegeVisitImportTemplate();
    setSuccess(
      "Import template downloaded — includes Contact 2 / Contact 3 and alternate phone columns.",
    );
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
    if (!currentUserId || !isDbAdmin) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const appendToBatchId =
        focusedImportBatch?.isLegacy
          ? "legacy"
          : focusedImportBatch &&
              !focusedImportBatch.isLegacy &&
              (focusedImportBatch.status === "completed" ||
                focusedImportBatch.status === "completed_with_errors")
            ? focusedImportBatch.id
            : null;
      if (appendToBatchId) body.append("appendToBatchId", appendToBatchId);

      const res = await fetch("/api/college-visits/import/upload", {
        method: "POST",
        credentials: "include",
        body,
      });
      const json = (await res.json()) as {
        batch?: CollegeImportBatchRow;
        append?: boolean;
        created?: number;
        skipped?: number;
        duplicateCount?: number;
        summary?: { newCount: number; duplicateCount: number; invalidCount: number; parseErrors?: string[] };
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setError(json.error || "Upload failed.");
        if (json.hint) setSuccess(json.hint);
        return;
      }
      if (json.append) {
        await silentRefreshVisits();
        await loadImportBatches();
        if (focusedImportBatch && !focusedImportBatch.isLegacy) {
          const listRes = await fetch("/api/college-visits/import", { credentials: "include" });
          const listJson = (await listRes.json()) as { batches?: CollegeImportBatchRow[] };
          if (listRes.ok) {
            setImportBatches(listJson.batches ?? []);
            const updated = (listJson.batches ?? []).find((b) => b.id === focusedImportBatch.id);
            if (updated) setFocusedImportBatch(updated);
          }
        }
        const created = json.created ?? 0;
        const skipped = json.skipped ?? 0;
        setSuccess(
          skipped > 0
            ? `Added ${created} college(s) to this folder. ${skipped} duplicate(s) skipped.`
            : `Added ${created} college(s) to this folder.`,
        );
        return;
      }
      if (!json.batch) {
        setError("Upload did not return a batch.");
        return;
      }
      await loadImportBatches();
      setFocusedImportBatch(json.batch);
      const dup = json.summary?.duplicateCount ?? json.batch.duplicate_count ?? 0;
      const fresh = json.summary?.newCount ?? json.batch.new_count ?? 0;
      setSuccess(
        dup > 0
          ? `“${file.name}” uploaded — ${fresh} new, ${dup} duplicate(s) to review before import.`
          : `“${file.name}” uploaded — ${fresh} new row(s) ready to import.`,
      );
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const handleExecuteBatchImport = async () => {
    if (!focusedImportBatch || focusedImportBatch.isLegacy || focusedImportBatch.status !== "ready_for_review") return;
    setBatchImportExecuting(true);
    setError(null);
    try {
      const res = await fetch(`/api/college-visits/import/${focusedImportBatch.id}/execute`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string; created?: number; skipped?: number; failed?: number };
      if (!res.ok) throw new Error(json.error || "Import failed.");
      await silentRefreshVisits();
      const listRes = await fetch("/api/college-visits/import", { credentials: "include" });
      const listJson = (await listRes.json()) as { batches?: CollegeImportBatchRow[] };
      if (listRes.ok) {
        setImportBatches(listJson.batches ?? []);
        const updated = (listJson.batches ?? []).find((b) => b.id === focusedImportBatch.id);
        if (updated) setFocusedImportBatch(updated);
      } else {
        await loadImportBatches();
      }
      setSuccess(
        `Import complete: ${json.created ?? 0} added, ${json.skipped ?? 0} duplicate(s) skipped${json.failed ? `, ${json.failed} failed` : ""}. You can now edit, assign, and call from this table.`,
      );
    } catch (e) {
      setError(friendlyCollegeVisitError(e));
    } finally {
      setBatchImportExecuting(false);
    }
  };

  const thClass = TABLE_DATA_TH;
  const tdClass = TABLE_DATA_TD;
  const dash = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const stackElevated = Boolean(focusedImportBatch);
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
          {cvRefreshing ? (
            <p className="mt-1 text-xs font-medium text-[#64748b]" aria-live="polite">
              Updating…
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-full border-[#e8dcc8]"
            disabled={loading || cvRefreshing}
            onClick={() => void (hasLoadedOnce ? silentRefreshVisits() : reload())}
          >
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

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {refreshError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>{refreshError}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full border-amber-300 px-3 text-xs"
              onClick={() => {
                setRefreshError(null);
                void silentRefreshVisits();
              }}
            >
              Retry
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setRefreshError(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      {!collegeCallOutcomeOpen ? (
        <CollegePendingCallBanner
          pending={pendingCollegeCall}
          onUpdate={() => setCollegeCallOutcomeOpen(true)}
          onDismiss={() => setPendingCollegeCall(null)}
        />
      ) : null}

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

      {isDbAdmin ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] px-4 py-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#64748b]" htmlFor="cv-employee-tracker">
            Employee
          </label>
          <select
            id="cv-employee-tracker"
            className="h-9 min-w-[12rem] rounded-lg border border-[#dbe6f3] bg-white px-3 text-sm text-[#334155]"
            value={fltOwner}
            onChange={(e) => setFltOwner(e.target.value)}
          >
            <option value="">All employees</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {fltOwner ? (
            <>
              <span className="text-xs text-[#64748b]">
                Showing colleges &amp; activity for{" "}
                <strong className="text-[#0f172a]">{ownerNameMap[fltOwner] || "selected employee"}</strong>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full border-[#e8dcc8] px-3 text-xs"
                onClick={() => setFltOwner("")}
              >
                Show all
              </Button>
            </>
          ) : (
            <span className="text-xs text-[#64748b]">Showing every employee&apos;s colleges (select one to track activity).</span>
          )}
        </div>
      ) : null}

      {activeTab !== "settings" ? (
        <TableSearchBar
          value={searchText}
          onChange={setSearchText}
          placeholder="Search college, location, contact, email, status…"
          showClear={filtersActive}
          onClear={clearTableFilters}
          hint={
            activeTab === "all-colleges"
              ? `Showing ${pageRows.length} of ${filteredVisits.length} college(s) | page ${page}/${totalPages}`
              : `Showing ${filteredVisits.length} of ${visits.length} college(s)${searchText.trim() ? " (filtered)" : ""} · ${CV_TAB_LABELS[activeTab]}`
          }
        />
      ) : null}

      {activeTab === "overview" ? <CollegeOverviewPanel visits={trackerVisits} loading={loading} /> : null}

      {activeTab === "follow-ups" ? (
        <CollegeFollowUpsPanel visits={filteredVisits} ownerNameMap={ownerNameMap} loading={loading} onOpen={setViewVisit} />
      ) : null}

      {activeTab === "pipeline" ? (
        <CollegePipelineBoard
          visits={filteredVisits}
          canEdit={isAdmin}
          canAddPipeline={isDbAdmin}
          statusOptions={cvLists.visitStatuses}
          onChangeStatus={(row, s) => void changePipelineStatus(row, s)}
          onOpen={setViewVisit}
          onAddPipeline={handleAddPipeline}
          addingPipeline={addingPipeline}
        />
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
      {activeTab === "settings" && isDbAdmin ? (
        <CollegeSettingsPanel
          lists={cvLists}
          onSaved={(next) => {
            setCvLists(next);
            setSuccess("College Visits settings saved. Dropdowns and pipeline columns updated.");
          }}
          onError={setError}
        />
      ) : null}

      {activeTab === "all-colleges" ? (
        <div className="space-y-3">
          {!pickForTask && !focusedImportBatch ? (
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
              {isDbAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm"
                  disabled={importing || schemaMissing}
                  onClick={() => importFileRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4 shrink-0" />
                  {importing ? "Uploading..." : "Import"}
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

          {showImportBatchList && !focusedImportBatch ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-[#64748b]">
                Each uploaded file appears separately with its upload date. Click a row to open the full college table
                — edit, assign to employees, call, WhatsApp, and email work exactly as before.
              </p>
              {batchBulk.selectedCount > 0 ? (
                <BulkSelectionBar selectedCount={batchBulk.selectedCount} onClear={batchBulk.clearSelection}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full border-rose-200 text-rose-700"
                    onClick={() => void handleBulkDeleteBatches()}
                    disabled={submitting}
                  >
                    Delete selected
                  </Button>
                </BulkSelectionBar>
              ) : null}
              <CollegeVisitImportBatchRowList
                batches={paginatedImportBatches}
                loading={importBatchesLoading || loading}
                selection={{
                  allSelected: batchBulk.allSelected,
                  someSelected: batchBulk.someSelected,
                  isSelected: batchBulk.isSelected,
                  onToggleAll: batchBulk.toggleAll,
                  onToggle: batchBulk.toggleOne,
                }}
                onOpenBatch={(batch) => {
                  setFocusedImportBatch(batch);
                  setPage(1);
                  visitBulk.clearSelection();
                }}
              />
              <TablePagination
                page={importBatchPage}
                totalPages={importBatchTotalPages}
                totalItems={importBatchTotalItems}
                pageSize={importBatchPageSize}
                onPageChange={setImportBatchPage}
                onPageSizeChange={setImportBatchPageSize}
              />
            </div>
          ) : null}

          {(!showImportBatchList || focusedImportBatch) ? (
            <div
              className={
                focusedImportBatch ? "fixed inset-0 z-[70] overflow-y-auto bg-[#f4f7fb]" : undefined
              }
            >
              <div className={focusedImportBatch ? "mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6" : "space-y-3"}>
                {focusedImportBatch ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-[#dbe6f3]"
                        onClick={() => setFocusedImportBatch(null)}
                      >
                        ← Back to uploads
                      </Button>
                      <div className="flex flex-wrap items-center gap-2">
                        {batchAwaitingImport ? (
                          <Button
                            type="button"
                            className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                            disabled={batchImportExecuting || focusedImportBatch.new_count <= 0}
                            onClick={() => void handleExecuteBatchImport()}
                          >
                            {batchImportExecuting
                              ? "Importing…"
                              : `Import ${focusedImportBatch.new_count} new college${focusedImportBatch.new_count === 1 ? "" : "s"}`}
                          </Button>
                        ) : null}
                        {!pickForTask && isDbAdmin && !batchAwaitingImport ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm"
                              onClick={handleDownloadTemplate}
                            >
                              <FileText className="mr-1 h-4 w-4 shrink-0" />
                              Import template
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm"
                              disabled={importing || schemaMissing}
                              onClick={() => importFileRef.current?.click()}
                            >
                              <Upload className="mr-1 h-4 w-4 shrink-0" />
                              {importing ? "Uploading…" : "Bulk upload"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm"
                              onClick={openCreate}
                            >
                              <Plus className="mr-1 h-4 w-4 shrink-0" />
                              Add college
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs sm:text-sm"
                              disabled={!rowsForExport.length}
                              onClick={handleExport}
                            >
                              <Download className="mr-1 h-4 w-4 shrink-0" />
                              {visitBulk.selectedCount > 0
                                ? `Export selected (${rowsForExport.length})`
                                : `Export (${rowsForExport.length})`}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <section className="rounded-2xl border border-[#c9a227] bg-[#fffdf8] p-4 shadow-sm sm:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">College visit upload</p>
                      <h2 className="mt-1 text-xl font-semibold text-[#0f172a] sm:text-2xl">{focusedImportBatch.file_name}</h2>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!focusedImportBatch.isLegacy ? (
                          <Badge className="border-[#dbe6f3] bg-white">{focusedImportBatch.batch_number}</Badge>
                        ) : null}
                        <Badge className="border-[#dbe6f3] bg-white">
                          {formatDisplayDate(focusedImportBatch.uploaded_at, "—")}
                        </Badge>
                        {!focusedImportBatch.isLegacy && batchAwaitingImport ? (
                          <>
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                              {focusedImportBatch.new_count} new
                            </Badge>
                            <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                              {focusedImportBatch.duplicate_count} duplicates
                            </Badge>
                          </>
                        ) : (
                          <Badge className="border-[#dbe6f3] bg-white">{visitsForFocusedBatch.length} colleges</Badge>
                        )}
                      </div>
                    </section>
                    {batchAwaitingImport && focusedImportBatch.duplicate_count > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <strong>{focusedImportBatch.duplicate_count} row(s)</strong> match colleges already in the system
                        and will be skipped. Click Import above to save only the new rows, then use this table to assign
                        and work the colleges.
                      </div>
                    ) : null}
                    {batchAwaitingImport ? (
                      <p className="text-sm text-[#64748b]">
                        Import saves new colleges into the system. After import, View / Edit / Activity and bulk assign
                        work here exactly like the main College Visits table.
                      </p>
                    ) : null}
                  </>
                ) : null}

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
                  /* --sticky-col-2 = S.No width (middle sticky); College Name uses after-check-2 */
                  ["--sticky-col-2" as string]: "4.25rem",
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
                  <TableHeaderCell
                    label="College Name"
                    className={`${thClass} sticky-col sticky-col-after-check-2 min-w-[14rem]`}
                  />
                  <TableHeaderCell label="Location" className={thClass} />
                  <TableHeaderCell label="Call" className={`${thClass} min-w-[5.5rem]`} />
                  <TableHeaderCell label="WhatsApp" className={`${thClass} min-w-[5.5rem]`} />
                  <TableHeaderCell label="Email" className={`${thClass} min-w-[5.5rem]`} />
                  <TableHeaderCell label="Connected Person Name" className={thClass} />
                  <TableHeaderCell label="Role" className={thClass} />
                  <TableHeaderFilter label="Visit Status" value={fltVisitStatus} options={cvLists.visitStatuses.map((s) => ({ value: s, label: s }))} onChange={setFltVisitStatus} className={thClass} />
                  <TableHeaderCell label="Visit Date" className={thClass} />
                  <TableHeaderCell label="Whom Visited to the College" className={thClass} />
                  <TableHeaderCell label="MOU Signed Status" className={thClass} />
                  <TableHeaderCell label="Follow-up Stage" className={thClass} />
                  <TableHeaderCell label="Last Follow-up Date" className={thClass} />
                  <TableHeaderCell label="Next Follow-up Date" className={thClass} />
                  <TableHeaderFilter label="Priority" value={fltPriority} options={COLLEGE_PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={setFltPriority} className={thClass} />
                  <TableHeaderFilter
                    label="Owner"
                    value={fltOwner}
                    options={ownerOptions.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={setFltOwner}
                    allLabel="All employees"
                    disabled={!isDbAdmin}
                    className={thClass}
                  />
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
                  <TableHeaderFilter label="Final Status" value={fltFinalStatus} options={cvLists.finalStatuses.map((s) => ({ value: s, label: s }))} onChange={setFltFinalStatus} className={thClass} />
                  <TableHeaderCell label="Source / Reference" className={thClass} />
                  {!pickForTask ? <TableHeaderCell label="Actions" className={thClass} /> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={26} className="px-4 py-8 text-center text-sm text-[#64748b]">
                      Loading...
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={26} className="px-4 py-8 text-center text-sm text-[#64748b]">
                      {batchAwaitingImport
                        ? "No new colleges to show yet. Click Import above to save rows from this file, then edit and assign here."
                        : "No college visits found."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, idx) => {
                    const days = daysSince(row.last_follow_up_date);
                    const due = isFollowUpDue(row);
                    const contacts = collegeContactsForRow(row);
                    const selectedContact = selectedCollegeContact(row, outreachContactIdFor(row));
                    const phone = anyCollegeOutreachPhone(row);
                    const email = anyCollegeOutreachEmail(row);
                    const flags = outreachDone[row.id] ?? {};
                    const person = selectedContact?.name?.trim() || row.connected_person_name || "-";
                    const personRole = selectedContact?.role?.trim() || row.connected_person_role || "";
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
                        <td
                          className={`${tdClass} sticky-col sticky-col-after-check-2 min-w-[14rem] max-w-[18rem] truncate font-medium`}
                          title={row.college_name}
                        >
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
                            email={email}
                            emailSent={flags.emailSent}
                            onEmailClick={() => requestCollegeEmail(row)}
                          />
                        </td>
                        <td className={`${tdClass} min-w-[12rem]`}>{person}</td>
                        <td className={`${tdClass} min-w-[14rem]`}>
                          {contacts.length > 1 ? (
                            <select
                              className="w-full max-w-[16rem] rounded-md border border-[#e2e8f0] bg-white px-2 py-1.5 text-xs text-[#0f172a] outline-none focus:border-[#c4a35a] focus:ring-1 focus:ring-[#c4a35a]/40"
                              value={selectedContact?.id || contacts[0]?.id || ""}
                              onChange={(e) => setVisitOutreachContact(row.id, e.target.value)}
                              aria-label={`Select contact role for ${row.college_name}`}
                              title="Choose who Call / WhatsApp / Email should use"
                            >
                              {contacts.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {contactRoleSelectLabel(c)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            personRole || "-"
                          )}
                        </td>
                        <td className={tdClass}>{row.visit_status}</td>
                        <td className={`${tdClass} min-w-[11rem]`}>{formatDisplayDate(row.visit_date)}</td>
                        <td className={`${tdClass} min-w-[12rem]`}>{row.visited_by || "-"}</td>
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
                          <td className={`${tdClass} min-w-[14rem]`}>
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-full px-2 text-[11px]"
                                onClick={() => setViewVisit(row)}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-full px-2 text-[11px]"
                                onClick={() => void openCollegeActivity(row)}
                              >
                                Activity
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-full px-2 text-[11px]"
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </Button>
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
                  const contacts = collegeContactsForRow(row);
                  const outreachContactId = outreachContactIdFor(row);
                  const selectedContact = selectedCollegeContact(row, outreachContactId);
                  const phone =
                    collegeOutreachTargetsForContact(row, outreachContactId, "phone")[0]?.phone || "";
                  const email =
                    collegeOutreachTargetsForContact(row, outreachContactId, "email")[0]?.email || "";
                  const flags = outreachDone[row.id] ?? {};
                  const person = selectedContact?.name?.trim() || row.connected_person_name || "—";
                  const personRole = selectedContact?.role?.trim() || row.connected_person_role || "";
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
                        {
                          label: "Role",
                          value:
                            contacts.length > 1
                              ? contactRoleSelectLabel(selectedContact || contacts[0])
                              : dash(personRole || row.connected_person_role),
                        },
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
                        { label: "Whom visited to the college", value: dash(row.visited_by) },
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
                      outreachSlot={
                        pickForTask ? undefined : (
                          <div className="space-y-2.5">
                            {contacts.length > 1 ? (
                              <div>
                                <label
                                  htmlFor={`cv-mobile-contact-${row.id}`}
                                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]"
                                >
                                  Contact role
                                </label>
                                <select
                                  id={`cv-mobile-contact-${row.id}`}
                                  className="w-full rounded-md border border-[#e2e8f0] bg-white px-2 py-2 text-xs text-[#0f172a] outline-none focus:border-[#c4a35a] focus:ring-1 focus:ring-[#c4a35a]/40"
                                  value={selectedContact?.id || contacts[0]?.id || ""}
                                  onChange={(e) => setVisitOutreachContact(row.id, e.target.value)}
                                  aria-label={`Select contact for ${row.college_name}`}
                                >
                                  {contacts.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {contactRoleSelectLabel(c)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            <StudentOutreachButtons
                              mode="all"
                              phone={phone}
                              whatsapp={phone}
                              email={email}
                              phoneCalled={flags.phoneCalled}
                              whatsappSent={flags.whatsappSent}
                              emailSent={flags.emailSent}
                              onPhoneClick={() => requestCollegePhone(row)}
                              onWhatsAppClick={() => requestCollegeWhatsApp(row)}
                              onEmailClick={() => requestCollegeEmail(row)}
                            />
                          </div>
                        )
                      }
                      primaryActions={
                        pickForTask
                          ? []
                          : [
                              { label: "View", onClick: () => setViewVisit(row) },
                              { label: "Edit", onClick: () => openEdit(row) },
                            ]
                      }
                      moreActions={
                        pickForTask
                          ? []
                          : [{ label: "Activity", onClick: () => void openCollegeActivity(row) }]
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
            </div>
          ) : null}
        </div>
      ) : null}

      <CollegeVisitFormPanel
        open={panelOpen}
        title={editId ? "Edit college visit" : "Add college visit"}
        value={form}
        owners={ownerOptions}
        submitting={submitting}
        canAssign={false}
        elevatedStack={stackElevated}
        onChange={setForm}
        onClose={() => setPanelOpen(false)}
        onSubmit={() => void handleSave()}
        existingOutcomeHistory={editingOutcomeHistory}
        visitStatusOptions={cvLists.visitStatuses}
        mouStatusOptions={cvLists.mouStatuses}
        finalStatusOptions={cvLists.finalStatuses}
        proposalStatusOptions={cvLists.proposalStatuses}
        proposalUploadSlot={
          <ProposalFileUpload
            entityType="college"
            entityId={editId}
            meta={proposalFileMeta}
            pendingFile={pendingProposalFiles[0] ?? null}
            pendingFiles={pendingProposalFiles}
            onPendingFileChange={(f) => setPendingProposalFiles(f ? [f] : [])}
            onPendingFilesChange={setPendingProposalFiles}
            multiple
            files={proposalFiles}
            onFilesChange={setProposalFiles}
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
            setPendingProposalFiles([]);
          }}
          onSave={() => void handleProposalSave()}
          submitting={proposalSubmitting}
          proposalStatusOptions={cvLists.proposalStatuses}
          proposalUploadSlot={
            <ProposalFileUpload
              entityType="college"
              entityId={proposalRow.id}
              meta={proposalFileMeta}
              pendingFile={pendingProposalFiles[0] ?? null}
              pendingFiles={pendingProposalFiles}
              onPendingFileChange={(f) => setPendingProposalFiles(f ? [f] : [])}
              onPendingFilesChange={setPendingProposalFiles}
              multiple
              files={proposalFiles}
              onFilesChange={setProposalFiles}
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
          <button
            type="button"
            aria-label="Close"
            className={`fixed inset-0 ${stackElevated ? "z-[80]" : "z-40"} bg-slate-900/40`}
            onClick={() => setViewVisit(null)}
          />
          <aside
            className={`fixed inset-y-0 right-0 ${stackElevated ? "z-[90]" : "z-50"} flex w-full max-w-md flex-col border-l border-[#e8dcc8] bg-white shadow-xl`}
          >
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
                <Button size="sm" className="rounded-full bg-[#c9a227] text-white" onClick={() => openEdit(viewVisit)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-full border-[#e8dcc8]"
                  onClick={() => void openCollegeActivity(viewVisit)}
                >
                  Activity
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={() => requestCollegePhone(viewVisit)}>
                  Call
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={() => requestCollegeWhatsApp(viewVisit)}>
                  WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-full border-[#e8dcc8]" onClick={() => requestCollegeEmail(viewVisit)}>
                  Email
                </Button>
                {isDbAdmin ? (
                  <Button size="sm" variant="outline" className="rounded-full border-rose-200 text-rose-700" onClick={() => void handleDelete(viewVisit.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <div className="mb-4 space-y-1 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3 text-xs text-[#64748b]">
                <p>
                  <span className="font-semibold text-[#3d3428]">Visit status:</span> {viewVisit.visit_status || "-"}
                </p>
                <p>
                  <span className="font-semibold text-[#3d3428]">Contact:</span> {viewVisit.contact_number || "-"}
                </p>
                <p>
                  <span className="font-semibold text-[#3d3428]">Email:</span> {viewVisit.email || "-"}
                </p>
                <p>
                  <span className="font-semibold text-[#3d3428]">Person:</span> {viewVisit.connected_person_name || "-"}
                  {viewVisit.connected_person_role ? ` (${viewVisit.connected_person_role})` : ""}
                </p>
                <p>
                  <span className="font-semibold text-[#3d3428]">Follow-up:</span>{" "}
                  {formatDisplayDate(viewVisit.next_follow_up_date) || "-"}
                </p>
                <p>
                  <span className="font-semibold text-[#3d3428]">Whom visited to the college:</span> {viewVisit.visited_by || "-"}
                </p>
              </div>
              <div className="mb-4 space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fefcf8] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b5d4d]">Outcome / remarks history</p>
                {parseOutcomeRemarkEntries(viewVisit.last_outcome_remarks).length ? (
                  <div className="max-h-44 space-y-2 overflow-y-auto">
                    {parseOutcomeRemarkEntries(viewVisit.last_outcome_remarks)
                      .slice()
                      .reverse()
                      .map((entry, idx) => (
                        <div key={`${entry.timestamp ?? "legacy"}-${idx}`} className="rounded-lg border border-[#e8dcc8] bg-white px-2.5 py-2">
                          <p className="text-[11px] font-semibold text-[#a68b2e]">{entry.timestamp ?? "Existing remark"}</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-[#3d3428]">{entry.text}</p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8a7a65]">No outcome remarks yet.</p>
                )}
              </div>
              <p className="mb-2 text-xs text-[#64748b]">
                Open <span className="font-semibold text-[#3d3428]">Activity</span> for the full timeline, or{" "}
                <span className="font-semibold text-[#3d3428]">Edit</span> to update the college form.
              </p>
            </div>
          </aside>
        </>
      ) : null}

      <LeadActivityModal
        open={!!activityVisit}
        title={activityVisit?.college_name || "College activity"}
        subtitle="From college_visit_activities"
        loading={activityModalLoading}
        activities={activityModalRows}
        employeeNameMap={ownerNameMap}
        elevatedStack={stackElevated}
        onClose={() => setActivityVisit(null)}
      />

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
          advanced
          providerOptions={["zoho", "gmail"]}
          defaultProvider={emailComposeProvider}
          defaultSubject={`AJ Academy follow-up for ${emailComposeVisit.college_name}${
            emailComposeTarget?.personLabel ? ` (${emailComposeTarget.personLabel})` : ""
          }`}
          submitting={emailSubmitting}
          onClose={() => {
            if (!emailSubmitting) {
              setEmailComposeVisit(null);
              setEmailComposeTarget(null);
              setEmailComposeProvider("zoho");
            }
          }}
          onSend={() => undefined}
          onSendDetailed={(payload) => void handleCollegeEmailSend(payload)}
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
                ? "Choose who to call"
                : outreachPicker.mode === "whatsapp"
                  ? "Choose WhatsApp contact"
                  : "Choose email contact"}
            </h3>
            <p className="mt-1 text-xs text-[#6b5d4d]">
              {outreachPicker.row.college_name} · numbers for the role selected in the Role column
              (or pick another if this person has multiple numbers)
            </p>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {outreachPicker.targets.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="flex w-full flex-col rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2.5 text-left transition hover:border-[#c9a227] hover:bg-[#faf3e3]"
                  onClick={() => {
                    const label = collegeOutreachTargetLabel(t);
                    if (outreachPicker.mode === "phone") void handleCollegePhoneClick(outreachPicker.row, t.phone, label);
                    else if (outreachPicker.mode === "whatsapp") openCollegeWhatsAppCompose(outreachPicker.row, t.phone);
                    else requestEmailProviderPicker(outreachPicker.row, t);
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#a68b2e]">
                    {t.role?.trim() || "Contact"}
                  </span>
                  <span className="text-sm font-semibold text-[#3d3428]">{t.personLabel || "Unnamed"}</span>
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
      {emailProviderPicker ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[60] bg-slate-900/40"
            onClick={() => setEmailProviderPicker(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[#3d3428]">Choose mail provider</h3>
            <p className="mt-1 text-xs text-[#6b5d4d]">
              {emailProviderPicker.row.college_name} · select how you want to send this email.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]"
                onClick={() =>
                  openCollegeEmailCompose(emailProviderPicker.row, emailProviderPicker.target ?? undefined, "zoho")
                }
              >
                Zoho Mail
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-[#e8dcc8]"
                onClick={() =>
                  openCollegeEmailCompose(emailProviderPicker.row, emailProviderPicker.target ?? undefined, "gmail")
                }
              >
                Gmail
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl border-[#e8dcc8]"
              onClick={() => setEmailProviderPicker(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : null}

      <CollegeCallOutcomeModal
        open={collegeCallOutcomeOpen}
        pending={pendingCollegeCall}
        visitStatusOptions={cvLists.visitStatuses}
        finalStatusOptions={cvLists.finalStatuses}
        submitting={collegeCallOutcomeSubmitting}
        onClose={() => setCollegeCallOutcomeOpen(false)}
        onSubmit={submitCollegeCallOutcome}
      />
    </section>
  );
}
