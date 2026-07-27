const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return UUID_LIKE.test(text);
}

export function resolveActorName(
  actorId: string | null | undefined,
  nameMap: Record<string, string>,
  fallback = "Team member",
): string {
  const id = String(actorId ?? "").trim();
  if (!id) return "—";
  return nameMap[id] || fallback;
}

export function formatActivityValue(
  value: string | null | undefined,
  nameMap: Record<string, string>,
  fallback = "Team member",
): string {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  if (isUuidLike(text)) return nameMap[text] || fallback;
  return text;
}
