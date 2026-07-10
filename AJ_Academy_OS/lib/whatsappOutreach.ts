import { mergeSettings } from "@/components/settings/settingsDefaults";
import { CRM_SETTINGS_KEY } from "@/lib/studentPrograms";
import { createClient } from "@/lib/supabase/client";

export const MAX_WHATSAPP_MESSAGE_LENGTH = 4096;
export const MAX_EMAIL_MESSAGE_LENGTH = 4096;

export const DEFAULT_WHATSAPP_TEMPLATES = [
  "Hi {name}, this is from AJ Academy. Thank you for your interest in our programs!",
  "Following up on your course enquiry. When would be a good time to speak?",
  "Sharing program details as discussed. Please let us know if you have any questions.",
  "Reminder: please confirm your preferred batch timing so we can reserve your seat.",
] as const;

export const DEFAULT_EMAIL_TEMPLATES = [
  "Hi {name},\n\nThank you for your interest in AJ Academy. Sharing the program details for your review.",
  "Hi {name},\n\nFollowing up on your enquiry. Please let us know a convenient time for a quick call.",
  "Hi {name},\n\nAs discussed, here are the next steps for your admission process.",
  "Hi {name},\n\nJust a reminder to confirm your preferred batch timing.",
] as const;

export function applyWhatsAppTemplate(template: string, leadName: string) {
  const name = leadName.trim() || "there";
  return template.replace(/\{name\}/gi, name);
}

export function formatWhatsAppActivityNotes(message: string) {
  return `WhatsApp message composed:\n${message.trim()}`;
}

export function applyEmailTemplate(template: string, leadName: string) {
  const name = leadName.trim() || "there";
  return template.replace(/\{name\}/gi, name);
}

export function formatEmailActivityNotes(message: string) {
  return `Email composed:\n${message.trim()}`;
}

export function parseWhatsAppTemplatesFromCrm(value: unknown): string[] {
  const merged = mergeSettings(CRM_SETTINGS_KEY, value);
  const raw = merged.whatsAppTemplates;
  if (!Array.isArray(raw)) return [...DEFAULT_WHATSAPP_TEMPLATES];
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : [...DEFAULT_WHATSAPP_TEMPLATES];
}

export function parseEmailTemplatesFromCrm(value: unknown): string[] {
  const merged = mergeSettings(CRM_SETTINGS_KEY, value);
  const raw = merged.emailTemplates;
  if (!Array.isArray(raw)) return [...DEFAULT_EMAIL_TEMPLATES];
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : [...DEFAULT_EMAIL_TEMPLATES];
}

export async function fetchWhatsAppTemplates(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", CRM_SETTINGS_KEY)
    .maybeSingle();
  if (error) return [...DEFAULT_WHATSAPP_TEMPLATES];
  return parseWhatsAppTemplatesFromCrm(data?.setting_value);
}

export async function fetchEmailTemplates(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", CRM_SETTINGS_KEY)
    .maybeSingle();
  if (error) return [...DEFAULT_EMAIL_TEMPLATES];
  return parseEmailTemplatesFromCrm(data?.setting_value);
}
