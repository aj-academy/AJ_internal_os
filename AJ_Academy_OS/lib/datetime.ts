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

/** Display calendar dates as dd/mm/yyyy (IST). Keep ISO (yyyy-mm-dd) for storage / date inputs. */
export function formatDisplayDate(value: string | null | undefined, empty = "—"): string {
  if (value == null || String(value).trim() === "") return empty;
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const isoDay = raw.slice(0, 10);
  const dateOnly = raw.length <= 10 || /^\d{4}-\d{2}-\d{2}/.test(raw);
  const parsed = dateOnly ? new Date(`${isoDay}T12:00:00+05:30`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const parts = new Intl.DateTimeFormat(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(parsed);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) {
    return parsed.toLocaleDateString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return `${day}/${month}/${year}`;
}

/** Same dd/mm/yyyy as formatDisplayDate (legacy name). */
export function formatDateIST(value: string | null | undefined): string {
  return formatDisplayDate(value, "-");
}

export function formatDateTimeIST(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const date = formatDisplayDate(value, "-");
  const time = parsed.toLocaleTimeString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time}`;
}

export function formatTimeIST(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Calendar date in India (IST) as YYYY-MM-DD — DB filters / date inputs only. */
export function todayDateIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
