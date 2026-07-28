"use client";

import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyEmailTemplate, MAX_EMAIL_MESSAGE_LENGTH } from "@/lib/whatsappOutreach";

export type EmailProvider = "gmail" | "zoho";

export type EmailAttachmentPayload = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type EmailComposeSubmitPayload = {
  provider: EmailProvider;
  to: string;
  cc: string;
  subject: string;
  message: string;
  attachments: EmailAttachmentPayload[];
};

type EmailComposeModalProps = {
  open: boolean;
  leadName: string;
  email: string;
  templates: string[];
  submitting?: boolean;
  advanced?: boolean;
  providerOptions?: EmailProvider[];
  defaultProvider?: EmailProvider;
  defaultSubject?: string;
  defaultCc?: string;
  onClose: () => void;
  onSend: (message: string) => void | Promise<void>;
  onSendDetailed?: (payload: EmailComposeSubmitPayload) => void | Promise<void>;
};

export function EmailComposeModal({
  open,
  leadName,
  email,
  templates,
  submitting = false,
  advanced = false,
  providerOptions = ["gmail", "zoho"],
  defaultProvider = "gmail",
  defaultSubject = "",
  defaultCc = "",
  onClose,
  onSend,
  onSendDetailed,
}: EmailComposeModalProps) {
  const [message, setMessage] = useState("");
  const [to, setTo] = useState(email);
  const [cc, setCc] = useState(defaultCc);
  const [subject, setSubject] = useState(defaultSubject);
  const [provider, setProvider] = useState<EmailProvider>(defaultProvider);
  const [files, setFiles] = useState<File[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  const appendTemplate = (template: string) => {
    const text = applyEmailTemplate(template, leadName);
    setMessage((prev) => {
      const next = prev.trim() ? `${prev.trim()}\n\n${text}` : text;
      return next.slice(0, MAX_EMAIL_MESSAGE_LENGTH);
    });
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const picked = Array.from(incoming);
    const merged = [...files, ...picked];
    if (merged.length > 5) {
      setLocalError("You can attach up to 5 files.");
      return;
    }
    const max = 10 * 1024 * 1024;
    if (merged.some((f) => f.size > max)) {
      setLocalError("Each attachment must be 10 MB or less.");
      return;
    }
    setLocalError(null);
    setFiles(merged);
  };

  const fileToBase64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Could not read attachment."));
      reader.readAsDataURL(f);
    });

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (!advanced || !onSendDetailed) {
      await onSend(trimmed);
      return;
    }
    const toVal = to.trim();
    const subjectVal = subject.trim();
    if (!toVal) {
      setLocalError("Recipient email is required.");
      return;
    }
    if (!subjectVal) {
      setLocalError("Subject is required.");
      return;
    }
    setLocalError(null);
    const attachments = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        contentType: f.type || "application/octet-stream",
        contentBase64: await fileToBase64(f),
      })),
    );
    await onSendDetailed({
      provider,
      to: toVal,
      cc: cc.trim(),
      subject: subjectVal,
      message: trimmed,
      attachments,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#d4deea] bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-[#eef2f7] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">Email outreach</h3>
            <p className="mt-1 text-sm font-medium text-[#334155]">{leadName}</p>
            <p className="text-xs text-[#64748b]">{email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[#f1f5f9]" aria-label="Close">
            <X className="h-5 w-5 text-[#64748b]" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {advanced ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Provider</span>
                  <select
                    value={provider}
                    disabled={submitting}
                    onChange={(e) => setProvider(e.target.value as EmailProvider)}
                    className="h-9 rounded-xl border border-[#cfdceb] px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                  >
                    {providerOptions.map((p) => (
                      <option key={p} value={p}>
                        {p === "zoho" ? "Zoho Mail" : "Gmail"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">To</span>
                  <input
                    value={to}
                    disabled={submitting}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 rounded-xl border border-[#cfdceb] px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                    placeholder="recipient@email.com"
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">CC</span>
                  <input
                    value={cc}
                    disabled={submitting}
                    onChange={(e) => setCc(e.target.value)}
                    className="h-9 rounded-xl border border-[#cfdceb] px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                    placeholder="optional@email.com, team@email.com"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Subject</span>
                  <input
                    value={subject}
                    disabled={submitting}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-9 rounded-xl border border-[#cfdceb] px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                    placeholder="Enter subject"
                  />
                </label>
              </div>
            </>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Quick templates</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template}
                  type="button"
                  disabled={submitting}
                  onClick={() => appendTemplate(template)}
                  className="rounded-full border border-[#dbe6f3] bg-[#f8fbff] px-3 py-1.5 text-left text-xs text-[#334155] transition hover:border-[#93c5fd] hover:bg-[#eff6ff] disabled:opacity-50"
                >
                  {applyEmailTemplate(template, leadName).slice(0, 72)}
                  {applyEmailTemplate(template, leadName).length > 72 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_EMAIL_MESSAGE_LENGTH))}
              rows={6}
              placeholder="Type your email message…"
              disabled={submitting}
              className="w-full resize-y rounded-xl border border-[#cfdceb] px-3 py-2.5 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            />
            <span className="text-right text-xs text-[#94a3b8]">
              {message.length}/{MAX_EMAIL_MESSAGE_LENGTH}
            </span>
          </label>

          {advanced ? (
            <div className="space-y-2 rounded-lg border border-[#dbe6f3] bg-[#f8fbff] px-3 py-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#334155]">
                <Paperclip className="h-3.5 w-3.5" />
                Attach files (max 5, 10 MB each)
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={submitting}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {files.length ? (
                <div className="space-y-1">
                  {files.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between text-xs text-[#475569]">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        disabled={submitting}
                        className="text-rose-600 hover:underline"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Sends from configured outreach email. Message is saved to activity history after it is sent.
            </p>
          )}
          {localError ? <p className="text-xs text-rose-700">{localError}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#eef2f7] px-5 py-4">
          <Button type="button" variant="outline" className="rounded-full" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-[#0284c7] hover:bg-[#0369a1]"
            disabled={submitting || !message.trim()}
            onClick={() => void submit()}
          >
            {submitting ? "Sending…" : "Send email"}
          </Button>
        </div>
      </div>
    </div>
  );
}
