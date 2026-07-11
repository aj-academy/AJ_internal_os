import type { createClient } from "@/lib/supabase/client";
import { logTaskActivity } from "@/lib/taskActivities";
import { displayLeadName } from "@/components/employee/leads/employeeLeadConfig";

export type TaskLinkedLead = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  phone_called?: boolean | null;
  whatsapp_sent?: boolean | null;
  email_sent?: boolean | null;
};

export function mapClientRowToTaskLinkedLead(row: {
  id: string;
  name?: string | null;
  lead_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  phone_called?: boolean | null;
  whatsapp_sent?: boolean | null;
  email_sent?: boolean | null;
}): TaskLinkedLead {
  return {
    id: row.id,
    name: displayLeadName({
      lead_name: row.lead_name ?? null,
      name: row.name ?? null,
      company_name: row.company_name ?? null,
    }),
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    email: row.email ?? null,
    phone_called: row.phone_called ?? null,
    whatsapp_sent: row.whatsapp_sent ?? null,
    email_sent: row.email_sent ?? null,
  };
}

export async function logTaskLeadPhoneCall(
  supabase: ReturnType<typeof createClient>,
  opts: { taskId: string; lead: TaskLinkedLead; userId: string; phone: string },
) {
  const now = new Date().toISOString();
  const { error: clientError } = await supabase
    .from("clients")
    .update({ phone_called: true, phone_called_at: now, last_contacted_at: now })
    .eq("id", opts.lead.id);
  if (clientError) throw new Error(clientError.message);

  await supabase.from("lead_activities").insert({
    client_id: opts.lead.id,
    activity_type: "Phone Call",
    notes: `Called ${opts.phone} (from task)`,
    created_by: opts.userId,
  });

  await logTaskActivity(supabase, {
    taskId: opts.taskId,
    actorId: opts.userId,
    activityType: "lead_phone_call",
    notes: `Called ${opts.lead.name} · ${opts.phone}`,
    metadata: { client_id: opts.lead.id },
  });
}

export async function logTaskLeadWhatsApp(
  supabase: ReturnType<typeof createClient>,
  opts: { taskId: string; lead: TaskLinkedLead; userId: string; messagePreview: string },
) {
  const now = new Date().toISOString();
  const { error: clientError } = await supabase
    .from("clients")
    .update({ whatsapp_sent: true, whatsapp_sent_at: now, last_contacted_at: now })
    .eq("id", opts.lead.id);
  if (clientError) throw new Error(clientError.message);

  await supabase.from("lead_activities").insert({
    client_id: opts.lead.id,
    activity_type: "WhatsApp Message",
    notes: opts.messagePreview,
    created_by: opts.userId,
  });

  await logTaskActivity(supabase, {
    taskId: opts.taskId,
    actorId: opts.userId,
    activityType: "lead_whatsapp",
    notes: `WhatsApp to ${opts.lead.name}`,
    metadata: { client_id: opts.lead.id },
  });
}

export async function logTaskLeadEmail(
  supabase: ReturnType<typeof createClient>,
  opts: { taskId: string; lead: TaskLinkedLead; userId: string; subject: string },
) {
  const now = new Date().toISOString();
  const { error: clientError } = await supabase
    .from("clients")
    .update({ email_sent: true, email_sent_at: now, last_contacted_at: now })
    .eq("id", opts.lead.id);
  if (clientError) throw new Error(clientError.message);

  await supabase.from("lead_activities").insert({
    client_id: opts.lead.id,
    activity_type: "Email",
    notes: opts.subject,
    created_by: opts.userId,
  });

  await logTaskActivity(supabase, {
    taskId: opts.taskId,
    actorId: opts.userId,
    activityType: "lead_email",
    notes: `Email to ${opts.lead.name}`,
    metadata: { client_id: opts.lead.id },
  });
}
