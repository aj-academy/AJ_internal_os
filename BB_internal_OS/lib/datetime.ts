const IST_TIMEZONE = "Asia/Kolkata";
const IST_LOCALE = "en-IN";

export function parseTimeToMinutes(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const amPmMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/);
  if (amPmMatch) {
    const hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }
    const hour24 = (hour % 12) + (amPmMatch[3] === "pm" ? 12 : 0);
    return hour24 * 60 + minute;
  }

  const twentyFourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourMatch) {
    const hour = Number(twentyFourMatch[1]);
    const minute = Number(twentyFourMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return hour * 60 + minute;
  }

  return null;
}

export function formatPermissionTime(value: string | null | undefined): string {
  if (!value) return "-";
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value;
  const hour24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`;
}

export function formatDateIST(value: string | null | undefined): string {
  if (!value) return "-";
  const dateOnly = value.length <= 10;
  const parsed = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTimeIST(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
