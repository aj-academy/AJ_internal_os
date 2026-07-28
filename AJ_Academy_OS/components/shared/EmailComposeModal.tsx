"use client";

import { useState, type KeyboardEvent } from "react";
import { Paperclip, Plus, X } from "lucide-react";
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

export const DEFAULT_EMAIL_SIGNATURE = `Thanks & Regards.

Sharmili Anandan
Business Manager
AJ Academy - Aspire | Achieve | Amplify
Ph : +91 6366953819
Email : Businessmanager@ajacademy.co.in
Web : www.ajacademy.co.in`;

function withDefaultSignature(body = "", signature = DEFAULT_EMAIL_SIGNATURE) {
  const trimmedBody = body.trimEnd();
  const sig = signature.trim();
  if (!sig) return trimmedBody;
  if (trimmedBody.includes(sig)) return trimmedBody;
  return trimmedBody ? `${trimmedBody}\n\n${sig}` : `\n\n${sig}`;
}

function parseCcList(raw: string) {
  return raw
    .split(/[,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

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
  defaultSignature?: string;
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
  defaultSignature = DEFAULT_EMAIL_SIGNATURE,
  onClose,
  onSend,
  onSendDetailed,
}: EmailComposeModalProps) {
  const [message, setMessage] = useState(() =>
    advanced ? withDefaultSignature("", defaultSignature) : "",
  );
  const [to, setTo] = useState(email);
  const [ccList, setCcList] = useState<string[]>(() => parseCcList(defaultCc));
  const [ccDraft, setCcDraft] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [provider, setProvider] = useState<EmailProvider>(defaultProvider);
  const [files, setFiles] = useState<File[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  const appendTemplate = (template: string) => {
    const text = applyEmailTemplate(template, leadName);
    setMessage((prev) => {
      const sig = defaultSignature.trim();
      const bodyOnly = sig && prev.includes(sig) ? prev.slice(0, prev.lastIndexOf(sig)).trimEnd() : prev.trimEnd();
      const nextBody = bodyOnly ? `${bodyOnly}\n\n${text}` : text;
      return withDefaultSignature(nextBody, defaultSignature).slice(0, MAX_EMAIL_MESSAGE_LENGTH);
    });
  };

  const addCcFromDraft = () => {
    const next = parseCcList(ccDraft);
    if (!next.length) return;
    setCcList((prev) => {
      const merged = [...prev];
      for (const emailAddr of next) {
        if (!merged.some((x) => x.toLowerCase() === emailAddr.toLowerCase())) merged.push(emailAddr);
      }
      return merged;
    });
    setCcDraft("");
  };

  const onCcKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addCcFromDraft();
    } else if (e.key === "Backspace" && !ccDraft && ccList.length) {
      setCcList((prev) => prev.slice(0, -1));
    }
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
    const pendingCc = parseCcList(ccDraft);
    const allCc = [...ccList];
    for (const emailAddr of pendingCc) {
      if (!allCc.some((x) => x.toLowerCase() === emailAddr.toLowerCase())) allCc.push(emailAddr);
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
      cc: allCc.join(", "),
      subject: subjectVal,
      message: trimmed,
      attachments,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-3 sm:p-6">
      <div
        className={[
          "flex w-full flex-col overflow-hidden rounded-2xl border border-[#e8dcc8] bg-white shadow-[0_24px_60px_rgba(61,52,40,0.18)]",
          advanced ? "max-h-[92vh] max-w-4xl" : "max-w-lg",
        ].join(" ")}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-[#e8dcc8] bg-[#fffdf8] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-[#3d3428]">Email outreach</h3>
            <p className="mt-1 text-sm font-medium text-[#5c4f3d]">{leadName}</p>
            <p className="text-xs text-[#8a7a65]">{email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-[#faf3e3]"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-[#8a7a65]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {advanced ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#8a7a65]">Provider</span>
                  <select
                    value={provider}
                    disabled={submitting}
                    onChange={(e) => setProvider(e.target.value as EmailProvider)}
                    className="h-10 rounded-xl border border-[#e8dcc8] bg-white px-3 text-sm text-[#3d3428] outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
                  >
                    {providerOptions.map((p) => (
                      <option key={p} value={p}>
                        {p === "zoho" ? "Zoho Mail" : "Gmail"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#8a7a65]">To</span>
                  <input
                    value={to}
                    disabled={submitting}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-10 rounded-xl border border-[#e8dcc8] px-3 text-sm text-[#3d3428] outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
                    placeholder="recipient@email.com"
                  />
                </label>
              </div>

              <div className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#8a7a65]">
                  CC (multiple)
                </span>
                <div className="min-h-10 rounded-xl border border-[#e8dcc8] bg-white px-2 py-1.5 focus-within:border-[#c9a227] focus-within:ring-2 focus-within:ring-[#c9a227]/25">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ccList.map((addr) => (
                      <span
                        key={addr}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#e8dcc8] bg-[#faf3e3] px-2.5 py-1 text-xs text-[#5c4f3d]"
                      >
                        <span className="truncate">{addr}</span>
                        <button
                          type="button"
                          disabled={submitting}
                          className="rounded-full p-0.5 hover:bg-white"
                          aria-label={`Remove ${addr}`}
                          onClick={() => setCcList((prev) => prev.filter((x) => x !== addr))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={ccDraft}
                      disabled={submitting}
                      onChange={(e) => setCcDraft(e.target.value)}
                      onKeyDown={onCcKeyDown}
                      onBlur={addCcFromDraft}
                      className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-[#3d3428] outline-none"
                      placeholder={ccList.length ? "Add another email…" : "type email + Enter"}
                    />
                    <button
                      type="button"
                      disabled={submitting || !ccDraft.trim()}
                      onClick={addCcFromDraft}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e8dcc8] bg-[#fffdf8] px-2 text-[11px] font-semibold text-[#5c4f3d] hover:border-[#c9a227] disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-[#8a7a65]">Press Enter, comma, or Add to include multiple CC addresses.</p>
              </div>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#8a7a65]">Subject</span>
                <input
                  value={subject}
                  disabled={submitting}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 rounded-xl border border-[#e8dcc8] px-3 text-sm text-[#3d3428] outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25"
                  placeholder="Enter subject"
                />
              </label>
            </>
          ) : null}

          {templates.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a7a65]">Quick templates</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template}
                    type="button"
                    disabled={submitting}
                    onClick={() => appendTemplate(template)}
                    className="rounded-full border border-[#e8dcc8] bg-[#fffdf8] px-3 py-1.5 text-left text-xs text-[#5c4f3d] transition hover:border-[#c9a227] hover:bg-[#faf3e3] disabled:opacity-50"
                  >
                    {applyEmailTemplate(template, leadName).slice(0, 72)}
                    {applyEmailTemplate(template, leadName).length > 72 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#8a7a65]">
              Message {advanced ? "(signature included — editable)" : ""}
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_EMAIL_MESSAGE_LENGTH))}
              rows={advanced ? 16 : 6}
              placeholder="Type your email message above the signature…"
              disabled={submitting}
              className="min-h-[12rem] w-full resize-y rounded-xl border border-[#e8dcc8] px-3 py-3 text-sm leading-relaxed text-[#3d3428] outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25 sm:min-h-[18rem]"
            />
            <span className="text-right text-xs text-[#a68b2e]">
              {message.length}/{MAX_EMAIL_MESSAGE_LENGTH}
            </span>
          </label>

          {advanced ? (
            <div className="space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2.5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#5c4f3d]">
                <Paperclip className="h-3.5 w-3.5 text-[#c9a227]" />
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
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between text-xs text-[#5c4f3d]">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        disabled={submitting}
                        className="text-rose-700 hover:underline"
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
            <p className="rounded-xl border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2 text-xs text-[#5c4f3d]">
              Sends from configured outreach email. Message is saved to activity history after it is sent.
            </p>
          )}
          {localError ? <p className="text-xs text-rose-700">{localError}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#e8dcc8] bg-[#fffdf8] px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-[#e8dcc8]"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
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
