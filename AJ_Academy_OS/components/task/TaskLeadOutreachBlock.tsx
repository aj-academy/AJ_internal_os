"use client";

import { useEffect, useState } from "react";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";
import type { TaskLinkedLead } from "@/lib/taskLeadOutreach";
import {
  logTaskLeadEmail,
  logTaskLeadPhoneCall,
  logTaskLeadWhatsApp,
} from "@/lib/taskLeadOutreach";
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

  const handleEmailSend = async (message: string) => {
    if (!emailLead || !userId) return;
    const email = emailLead.email?.trim();
    if (!email) {
      onError?.("No email on this lead.");
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      onError?.("Enter a message.");
      return;
    }
    setSubmitting(true);
    try {
      const subject = `AJ Academy follow-up for ${emailLead.name}`;
      const res = await fetch("/api/outreach/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject, body: trimmed }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Email failed.");

      await logTaskLeadEmail(supabase, {
        taskId,
        lead: emailLead,
        userId,
        subject,
      });
      patchLead(emailLead.id, { email_sent: true });
      setEmailLead(null);
      onSuccess?.("Email sent and logged on lead and task activity.");
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
                  onEmailClick={() => setEmailLead(lead)}
                />
              ) : null}
              {compact ? (
                <StudentOutreachButtons
                  mode="both"
                  phone={lead.phone}
                  whatsapp={lead.whatsapp}
                  phoneCalled={lead.phone_called}
                  whatsappSent={lead.whatsapp_sent}
                  onPhoneClick={() => void handlePhone(lead)}
                  onWhatsAppClick={() => setWaLead(lead)}
                />
              ) : null}
              {compact ? (
                <StudentOutreachButtons
                  mode="email"
                  email={lead.email}
                  emailSent={lead.email_sent}
                  onEmailClick={() => setEmailLead(lead)}
                />
              ) : null}
              {compact ? <span className="max-w-[100px] truncate text-xs text-[#64748b]" title={lead.name}>{lead.name}</span> : null}
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

      <EmailComposeModal
        open={!!emailLead}
        leadName={emailLead?.name ?? ""}
        email={emailLead?.email ?? ""}
        templates={emailTemplates}
        submitting={submitting}
        onClose={() => !submitting && setEmailLead(null)}
        onSend={(message) => void handleEmailSend(message)}
      />
    </>
  );
}
