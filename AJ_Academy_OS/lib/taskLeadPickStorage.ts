const LEAD_SELECTION_KEY = "aj_task_lead_selection";
const COLLEGE_SELECTION_KEY = "aj_task_college_selection";
const ASSIGN_DRAFT_KEY = "aj_task_assign_draft";

export type TaskLeadSelection = {
  ids: string[];
  labels: string[];
  filterPath: string;
};

export type TaskCollegeSelection = TaskLeadSelection;

export type TaskAssignDraft = {
  title: string;
  description: string;
  assigned_to: string;
  assignment_type: string;
  project_id: string;
  priority: string;
  status: string;
  start_date: string;
  due_date: string;
  progress: number;
};

export function saveTaskLeadSelection(selection: TaskLeadSelection) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LEAD_SELECTION_KEY, JSON.stringify(selection));
}

export function consumeTaskLeadSelection(): TaskLeadSelection | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(LEAD_SELECTION_KEY);
  sessionStorage.removeItem(LEAD_SELECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TaskLeadSelection;
    if (!Array.isArray(parsed.ids)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTaskCollegeSelection(selection: TaskCollegeSelection) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(COLLEGE_SELECTION_KEY, JSON.stringify(selection));
}

export function consumeTaskCollegeSelection(): TaskCollegeSelection | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(COLLEGE_SELECTION_KEY);
  sessionStorage.removeItem(COLLEGE_SELECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TaskCollegeSelection;
    if (!Array.isArray(parsed.ids)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTaskAssignDraft(draft: TaskAssignDraft) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ASSIGN_DRAFT_KEY, JSON.stringify(draft));
}

export function consumeTaskAssignDraft(): TaskAssignDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ASSIGN_DRAFT_KEY);
  sessionStorage.removeItem(ASSIGN_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskAssignDraft;
  } catch {
    return null;
  }
}
