"use client";

import { Button } from "@/components/ui/button";
import type { ImportConflictAction, ImportConflictRow } from "@/components/student-lead-master/studentMasterCsv";

type Props = {
  conflicts: ImportConflictRow[];
  freshCount: number;
  actions: Record<string, ImportConflictAction>;
  busy: boolean;
  onChangeAction: (key: string, action: ImportConflictAction) => void;
  onApplyAll: (action: ImportConflictAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const ACTION_LABEL: Record<ImportConflictAction, string> = {
  update: "Update existing",
  add_new: "Add as new",
  skip: "Don't add",
};

export function LeadImportConflictModal({
  conflicts,
  freshCount,
  actions,
  busy,
  onChangeAction,
  onApplyAll,
  onConfirm,
  onCancel,
}: Props) {
  const updateCount = conflicts.filter((c) => (actions[c.key] ?? c.defaultAction) === "update").length;
  const addNewCount = conflicts.filter((c) => (actions[c.key] ?? c.defaultAction) === "add_new").length;
  const skipCount = conflicts.filter((c) => (actions[c.key] ?? c.defaultAction) === "skip").length;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-import-conflict-title"
    >
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onCancel} disabled={busy} />
      <div className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#e8dcc8] bg-white shadow-[0_24px_60px_rgba(61,52,40,0.22)]">
        <div className="border-b border-[#e8dcc8] bg-[#fffdf8] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Student Master import</p>
          <h3 id="lead-import-conflict-title" className="text-lg font-semibold text-[#0f172a]">
            Import conflicts found
          </h3>
          <p className="mt-1 text-sm text-[#64748b]">
            {conflicts.length} matching lead{conflicts.length === 1 ? "" : "s"} already in the app · {freshCount} new
            row{freshCount === 1 ? "" : "s"} will be added. Compare sheet vs existing, then choose Update, Add as new, or
            Don&apos;t add for each row.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onApplyAll("update")}>
              Set all: Update existing
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onApplyAll("add_new")}>
              Set all: Add as new
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onApplyAll("skip")}>
              Set all: Don&apos;t add
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-5">
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="bg-[#f8fbff] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Student (sheet)</th>
                  <th className="px-3 py-2 font-semibold">Mobile / Email</th>
                  <th className="px-3 py-2 font-semibold">Existing status / stage / priority</th>
                  <th className="px-3 py-2 font-semibold">Sheet status / stage / priority</th>
                  <th className="px-3 py-2 font-semibold">Changed?</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((row) => {
                  const action = actions[row.key] ?? row.defaultAction;
                  const existingName = row.existing.lead_name || row.existing.name || "—";
                  const changed =
                    row.statusChanged || row.stageChanged || row.priorityChanged
                      ? [
                          row.statusChanged ? "status" : null,
                          row.stageChanged ? "stage" : null,
                          row.priorityChanged ? "priority" : null,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "Same";
                  return (
                    <tr key={row.key} className="border-t border-[#eef2f7] align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#0f172a]">{row.sheet.lead_name}</p>
                        <p className="text-xs text-[#64748b]">Matches: {existingName}</p>
                      </td>
                      <td className="px-3 py-2 text-[#475569]">
                        <p>{row.sheet.phone || "—"}</p>
                        <p className="text-xs">{row.sheet.email || "—"}</p>
                      </td>
                      <td className="px-3 py-2 text-[#475569]">
                        {row.existing.status || "—"} / {row.existing.lead_stage || "—"} / {row.existing.priority || "—"}
                      </td>
                      <td className="px-3 py-2 text-[#0f172a]">
                        {row.sheet.status || "—"} / {row.sheet.lead_stage || "—"} / {row.sheet.priority || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            changed === "Same"
                              ? "rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs text-[#64748b]"
                              : "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900"
                          }
                        >
                          {changed}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full min-w-[140px] rounded-md border border-[#e2e8f0] bg-white px-2 py-1.5 text-xs"
                          value={action}
                          disabled={busy}
                          onChange={(e) => onChangeAction(row.key, e.target.value as ImportConflictAction)}
                        >
                          {(Object.keys(ACTION_LABEL) as ImportConflictAction[]).map((id) => (
                            <option key={id} value={id}>
                              {ACTION_LABEL[id]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8dcc8] bg-[#fffdf8] px-5 py-4">
          <p className="text-xs text-[#64748b]">
            Will update {updateCount} · add as new {addNewCount} · skip {skipCount} · plus {freshCount} fresh row
            {freshCount === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={onConfirm} className="bg-[#c9a227] text-white hover:bg-[#b8921f]">
              {busy ? "Importing…" : "Apply import"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
