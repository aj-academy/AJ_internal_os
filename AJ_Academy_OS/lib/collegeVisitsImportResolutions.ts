export type CollegeDuplicateResolution = "skip" | "add" | "update";

export type CollegeDuplicateResolutionMap = Record<string, CollegeDuplicateResolution>;

export function defaultDuplicateResolution(): CollegeDuplicateResolution {
  return "skip";
}

export function parseDuplicateResolutions(meta: unknown): CollegeDuplicateResolutionMap {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const raw = (meta as { duplicate_resolutions?: unknown }).duplicate_resolutions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CollegeDuplicateResolutionMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === "skip" || value === "add" || value === "update") out[key] = value;
  }
  return out;
}

export function mergeDuplicateResolutions(
  current: CollegeDuplicateResolutionMap,
  patch: CollegeDuplicateResolutionMap,
): CollegeDuplicateResolutionMap {
  return { ...current, ...patch };
}

export function resolutionForRow(
  map: CollegeDuplicateResolutionMap,
  rowId: string,
): CollegeDuplicateResolution {
  return map[rowId] ?? defaultDuplicateResolution();
}

export function resolutionLabel(action: CollegeDuplicateResolution): string {
  if (action === "add") return "Add anyway";
  if (action === "update") return "Update existing file";
  return "Don't add";
}

export function resolutionHelp(action: CollegeDuplicateResolution): string {
  if (action === "add") return "Save into this new upload folder only.";
  if (action === "update") return "Change the college in the existing folder (not this file).";
  return "Leave the existing folder unchanged and do not add this row.";
}

export function stripFileExtension(name: string): string {
  return name.replace(/\.(csv|xlsx|xls)$/i, "").trim() || name;
}
