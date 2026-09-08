"use client";

import { useMemo, useState } from "react";
import { FolderPlus, FolderTree, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollegeImportBatchRow } from "@/components/college-visits/CollegeVisitImportBatchRowList";

export type CollegeVisitSaveLocation =
  | { mode: "existing"; batchId: string | null }
  | { mode: "new"; folderName: string };

type Props = {
  open: boolean;
  collegeName: string;
  folders: CollegeImportBatchRow[];
  defaultBatchId?: string | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (location: CollegeVisitSaveLocation) => void;
};

export function CollegeVisitSaveLocationDialog({
  open,
  collegeName,
  folders,
  defaultBatchId = null,
  saving = false,
  onClose,
  onConfirm,
}: Props) {
  const selectableFolders = useMemo(
    () =>
      folders
        .filter((folder) => !folder.isLegacy)
        .sort((a, b) => a.file_name.localeCompare(b.file_name)),
    [folders],
  );
  const [mode, setMode] = useState<"existing" | "new">(defaultBatchId ? "existing" : "new");
  const [batchId, setBatchId] = useState<string>(defaultBatchId || "");
  const [folderName, setFolderName] = useState("");

  if (!open) return null;

  const confirm = () => {
    if (mode === "new") {
      const name = folderName.trim();
      if (!name) return;
      onConfirm({ mode: "new", folderName: name });
      return;
    }
    onConfirm({ mode: "existing", batchId: batchId || null });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#e8dcc8] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e8dcc8] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Save location</p>
            <h2 className="mt-1 text-lg font-semibold text-[#0f172a]">Where should this college be saved?</h2>
            <p className="mt-1 truncate text-sm text-[#64748b]" title={collegeName}>
              {collegeName}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]"
            onClick={onClose}
            disabled={saving}
            aria-label="Close save location"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <label
            className={`block cursor-pointer rounded-xl border p-4 transition ${
              mode === "new" ? "border-[#c9a227] bg-[#fffdf8]" : "border-[#dbe6f3] bg-white"
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="college-save-location"
                checked={mode === "new"}
                onChange={() => setMode("new")}
                className="accent-[#c9a227]"
              />
              <FolderPlus className="h-5 w-5 text-[#a68b2e]" />
              <span>
                <span className="block text-sm font-semibold text-[#0f172a]">Create and save in a new folder</span>
                <span className="block text-xs text-[#64748b]">The folder will appear with the uploaded folders.</span>
              </span>
            </span>
            {mode === "new" ? (
              <Input
                autoFocus
                className="mt-3"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Enter folder name"
                maxLength={120}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && folderName.trim()) {
                    event.preventDefault();
                    confirm();
                  }
                }}
              />
            ) : null}
          </label>

          <label
            className={`block cursor-pointer rounded-xl border p-4 transition ${
              mode === "existing" ? "border-[#c9a227] bg-[#fffdf8]" : "border-[#dbe6f3] bg-white"
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="college-save-location"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
                className="accent-[#c9a227]"
              />
              <FolderTree className="h-5 w-5 text-[#a68b2e]" />
              <span>
                <span className="block text-sm font-semibold text-[#0f172a]">Save in an existing folder</span>
                <span className="block text-xs text-[#64748b]">Select any available College Visits folder.</span>
              </span>
            </span>
            {mode === "existing" ? (
              <select
                className="mt-3 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#c9a227]"
                value={batchId}
                onChange={(event) => setBatchId(event.target.value)}
              >
                <option value="">All Colleges (no specific folder)</option>
                {selectableFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.file_name}
                  </option>
                ))}
              </select>
            ) : null}
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e8dcc8] bg-[#fafcff] px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#c9a227] text-white hover:bg-[#b8921f]"
            onClick={confirm}
            disabled={saving || (mode === "new" && !folderName.trim())}
          >
            {saving ? "Saving…" : mode === "new" ? "Create folder & save" : "Save college"}
          </Button>
        </div>
      </div>
    </div>
  );
}
