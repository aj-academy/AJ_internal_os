export const MOOD_EMOJI: Record<string, string> = {
  happy: "😊",
  excited: "🤩",
  neutral: "😐",
  tired: "😴",
  sad: "😢",
  angry: "😠",
};

export const MOOD_LABEL: Record<string, string> = {
  happy: "Happy",
  excited: "Excited",
  neutral: "Neutral",
  tired: "Tired",
  sad: "Sad",
  angry: "Angry",
};

export function formatMoodCell(mood: string | null | undefined): string {
  if (!mood) return "—";
  const key = mood.toLowerCase();
  const emoji = MOOD_EMOJI[key] ?? "🙂";
  const label = MOOD_LABEL[key] ?? mood;
  return `${emoji} ${label}`;
}
