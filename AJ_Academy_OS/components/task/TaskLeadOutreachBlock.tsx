"use client";

import { useEffect, useState } from "react";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import type { EmailComposeSubmitPayload } from "@/components/shared/EmailComposeModal";
import { Button } from "@/components/ui/button";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";
import type { TaskLinkedLead } from "@/lib/taskLeadOutreach";
import {
  logTaskLeadEmail,
  logTaskLeadPhoneCall,
  logTaskLeadWhatsApp,
} from "@/lib/taskLeadOutreach";
import { formatEmailActivityNotes, MAX_EMAIL_MESSAGE_LENGTH } from "@/lib/whatsappOutreach";
import type { createClient } from "@/lib/supabase/client";

type TaskLeadOutreachBlockProps = {
  taskId: string;
  leads: TaskLinkedLead[];
  supabase: ReturnType<typeof createClient>;
  userId: string;
  emailTemplates?: string[];
  whatsAppTemplates?: string[];
  compact?: boolean;
  onUpdated?: () => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

export function TaskLeadOutreachBlock({
  taskId,
  leads,
  supabase,
  userId,
  emailTemplates = [],
  whatsAppTemplates = [],
  compact = false,
  onUpdated,
  onError,
  onSuccess,
}: TaskLeadOutreachBlockProps) {
  const [localLeads, setLocalLeads] = useState(leads);
  const [waLead, setWaLead] = useState<TaskLinkedLead | null>(null);
  const [emailLead, setEmailLead] = useState<TaskLinkedLead | null>(null);
  const [emailComposeProvider, setEmailComposeProvider] = useState<"zoho" | "gmail">("zoho");
  const [emailProviderPickerLead, setEmailProviderPickerLead] = useState<TaskLinkedLead | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const patchLead = (id: string, patch: Partial<TaskLinkedLead>) => {
    setLocalLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handlePhone = async (lead: TaskLinkedLead) => {
    const phone = lead.phone?.trim();
    if (!phone || !userId) return;
    try {
      window.location.href = `tel:${phone}`;
      await logTaskLeadPhoneCall(supabase, { taskId, lead, userId, phone });
      patchLead(lead.id, { phone_called: true });
      onSuccess?.(`Call logged for ${lead.name}.`);
      onUpdated?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not log call.");
    }
  };

  const handleWhatsAppSend = async (message: string) => {
    if (!waLead || !userId) return;
    const trimmed = message.trim();
    if (!trimmed) {
      onError?.("Enter a message.");
      return;
    }
    const wa = whatsAppHref(waLead.whatsapp || waLead.phone, trimmed);
    if (!wa) {
      onError?.("No WhatsApp number.");
      return;
    }
    setSubmitting(true);
    try {
      window.open(wa, "_blank", "noopener,noreferrer");
      await logTaskLeadWhatsApp(supabase, {
        taskId,
        lead: waLead,
        userId,
        messagePreview: trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed,
      });
      patchLead(waLead.id, { whatsapp_sent: true });
      setWaLead(null);
      onSuccess?.("WhatsApp logged on lead and task activity.");
      onUpdated?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not log WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  };

  const openEmailCompose = (lead: TaskLinkedLead, provider: "zoho" | "gmail") => {
    if (!lead.email?.trim()) {
      onError?.("No email on this lead.");
      return;
    }
    setEmailProviderPickerLead(null);
    setEmailComposeProvider(provider);
    setEmailLead(lead);
  };

  const handleEmailSend = async (payload: EmailComposeSubmitPayload) => {
    if (!emailLead || !userId) return;
    const email = (payload.to || emailLead.email || "").trim();
    if (!email) {
      onError?.("No email on this lead.");
      return;
    }
    const trimmed = payload.message.trim();
    if (!trimmed) {
      onError?.("Enter a message.");
      return;
    }
    if (trimmed.length > MAX_EMAIL_MESSAGE_LENGTH) {
      onError?.(`Message is too long (max ${MAX_EMAIL_MESSAGE_LENGTH} characters).`);
      return;
    }
    setSubmitting(true);
    try {
      const subject = payload.subject.trim() || `AJ Academy follow-up for ${emailLead.name}`;
      const res = await fetch("/api/outreach/send-email", {
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
      const json = (await res.json()) as { error?: string; from?: string };
      if (!res.ok) throw new Error(json.error ?? "Email failed.");

      const notes = formatEmailActivityNotes(trimmed, {
        provider: payload.provider,
        from: json.from,
        to: email,
        cc: payload.cc,
        subject,
      });
      await logTaskLeadEmail(supabase, {
        taskId,
        lead: emailLead,
        userId,
        subject,
        notes,
      });
      patchLead(emailLead.id, { email_sent: true });
      setEmailLead(null);
      onSuccess?.(
        `Email sent via ${payload.provider === "zoho" ? "Zoho" : "Gmail"} and logged on lead & task activity.`,
      );
      onUpdated?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not send email.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!localLeads.length) return null;

  return (
    <>
      <div className={compact ? "space-y-1" : "space-y-3"}>
        {localLeads.map((lead) => (
          <div
            key={lead.id}
            className={compact ? "flex flex-wrap items-center gap-2" : "rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-3"}
          >
            {!compact ? <p className="text-sm font-medium text-[#0f172a]">{lead.name}</p> : null}
            <div className={compact ? "flex items-center gap-2" : "mt-2 flex flex-wrap items-center gap-3"}>
              {!compact ? (
                <StudentOutreachButtons
                  mode="phone"
                  phone={lead.phone}
                  phoneCalled={lead.phone_called}
                  onPhoneClick={() => void handlePhone(lead)}
                />
              ) : null}
              {!compact ? (
                <StudentOutreachButtons
                  mode="whatsapp"
                  phone={lead.phone}
                  whatsapp={lead.whatsapp}
                  whatsappSent={lead.whatsapp_sent}
                  onWhatsAppClick={() => setWaLead(lead)}
                />
              ) : null}
              {!compact ? (
                <StudentOutreachButtons
                  mode="email"
                  email={lead.email}
                  emailSent={lead.email_sent}
                  onEmailClick={() => setEmailProviderPickerLead(lead)}
                />
              ) : null}
              {compact ? (
                <StudentOutreachButtons
                  mode="both"
                  phone={lead.phone}
                  whatsapp={lead.whatsapp}
                  email={lead.email}
                  phoneCalled={lead.phone_called}
                  whatsappSent={lead.whatsapp_sent}
                  emailSent={lead.email_sent}
                  onPhoneClick={() => void handlePhone(lead)}
                  onWhatsAppClick={() => setWaLead(lead)}
                  onEmailClick={() => setEmailProviderPickerLead(lead)}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <WhatsAppComposeModal
        open={!!waLead}
        leadName={waLead?.name ?? ""}
        phone={waLead?.whatsapp || waLead?.phone || ""}
        templates={whatsAppTemplates}
        submitting={submitting}
        onClose={() => !submitting && setWaLead(null)}
        onSend={(message) => void handleWhatsAppSend(message)}
      />

      {emailLead ? (
        <EmailComposeModal
          open={Boolean(emailLead)}
          leadName={emailLead.name}
          email={emailLead.email ?? ""}
          templates={emailTemplates}
          advanced
          providerOptions={["zoho", "gmail"]}
          defaultProvider={emailComposeProvider}
          defaultSubject={`AJ Academy follow-up for ${emailLead.name}`}
          submitting={submitting}
          onClose={() => {
            if (!submitting) {
              setEmailLead(null);
              setEmailComposeProvider("zoho");
            }
          }}
          onSend={() => undefined}
          onSendDetailed={(payload) => void handleEmailSend(payload)}
        />
      ) : null}

      {emailProviderPickerLead ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[60] bg-slate-900/40"
            onClick={() => setEmailProviderPickerLead(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[#3d3428]">Choose mail provider</h3>
            <p className="mt-1 text-xs text-[#6b5d4d]">
              {emailProviderPickerLead.name} · select how you want to send this email.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]"
                onClick={() => openEmailCompose(emailProviderPickerLead, "zoho")}
              >
                Zoho Mail
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-[#e8dcc8]"
                onClick={() => openEmailCompose(emailProviderPickerLead, "gmail")}
              >
                Gmail
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl border-[#e8dcc8]"
              onClick={() => setEmailProviderPickerLead(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
