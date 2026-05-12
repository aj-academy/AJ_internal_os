"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TaskRecord } from "@/types/task";

interface TaskCompleteDialogProps {
  task: TaskRecord | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (summary: string) => Promise<void>;
}

export function TaskCompleteDialog({ task, submitting, onClose, onSubmit }: TaskCompleteDialogProps) {
  const [summary, setSummary] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setSummary("");
    setLocalError(null);
  }, [task]);

  if (!task) return null;

  const handleSubmit = async () => {
    const t = summary.trim();
    if (t.length < 3) {
      setLocalError("Please add a short summary of what was completed.");
      return;
    }
    setLocalError(null);
    await onSubmit(t);
  };

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[62] bg-slate-900/40" onClick={() => !submitting && onClose()} />
      <div className="fixed left-1/2 top-1/2 z-[63] w-[min(100%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[#d4deea] bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-[#0f172a]">Complete task</h3>
        <p className="mt-1 text-sm text-[#64748b]">
          <span className="font-medium text-[#334155]">{task.title}</span>
          {task.assigner_display_name ? (
            <>
              {" "}
              · Assigned by <span className="font-medium">{task.assigner_display_name}</span>
            </>
          ) : null}
        </p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#64748b]">Completion summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={submitting}
          rows={5}
          placeholder="Describe what was delivered or finished…"
          className="mt-2 w-full resize-y rounded-xl border border-[#d4deea] bg-[#fbfdff] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe] disabled:opacity-60"
        />
        {localError ? <p className="mt-2 text-sm text-rose-600">{localError}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose} className="rounded-full">
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void handleSubmit()} className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
            {submitting ? "Saving…" : "Task completed"}
          </Button>
        </div>
      </div>
    </>
  );
}
