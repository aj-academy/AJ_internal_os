"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayDateIST } from "@/lib/datetime";

export type MoodKey = "happy" | "sad" | "angry" | "neutral" | "tired" | "excited";

const MOOD_OPTIONS: { key: MoodKey; emoji: string; label: string }[] = [
  { key: "happy", emoji: "😊", label: "Happy" },
  { key: "excited", emoji: "🤩", label: "Excited" },
  { key: "neutral", emoji: "😐", label: "Neutral" },
  { key: "tired", emoji: "😴", label: "Tired" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "angry", emoji: "😠", label: "Angry" },
];

export function DailyMoodSurveyDialog() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const checkToday = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setOpen(false);
        return;
      }
      const today = todayDateIST();
      const { data, error: fetchError } = await supabase
        .from("employee_daily_mood_checkins")
        .select("id")
        .eq("employee_id", uid)
        .eq("mood_date", today)
        .maybeSingle();

      if (fetchError) {
        const m = fetchError.message.toLowerCase();
        if (m.includes("employee_daily_mood") || m.includes("schema cache") || m.includes("does not exist")) {
          setOpen(false);
          return;
        }
        setError(fetchError.message);
        setOpen(false);
        return;
      }
      setOpen(!data);
    } finally {
      setChecking(false);
    }
  }, [supabase]);

  useEffect(() => {
    void checkToday();
  }, [checkToday]);

  const submitMood = async (mood: MoodKey) => {
    setSaving(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      const { error: insertError } = await supabase.from("employee_daily_mood_checkins").insert({
        employee_id: uid,
        mood_date: todayDateIST(),
        mood,
      });

      if (insertError) throw new Error(insertError.message);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your mood.");
    } finally {
      setSaving(false);
    }
  };

  if (checking || !open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mood-survey-title">
      <div className="w-full max-w-md rounded-2xl border border-[#d4deea] bg-white p-6 shadow-xl">
        <p id="mood-survey-title" className="text-center text-lg font-semibold text-[#0f172a]">
          How are you feeling today?
        </p>
        <p className="mt-1 text-center text-sm text-[#64748b]">Pick one emoji to continue. Your response is shared with admins.</p>

        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {MOOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={saving}
              onClick={() => void submitMood(option.key)}
              className="flex flex-col items-center gap-1 rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-3 transition hover:border-[#2563eb] hover:bg-[#eff6ff] disabled:opacity-60"
            >
              <span className="text-3xl leading-none" aria-hidden>
                {option.emoji}
              </span>
              <span className="text-[11px] font-medium text-[#64748b]">{option.label}</span>
            </button>
          ))}
        </div>

        {error ? <p className="mt-4 text-center text-sm text-rose-600">{error}</p> : null}
        {saving ? <p className="mt-3 text-center text-xs text-[#64748b]">Saving…</p> : null}
      </div>
    </div>
  );
}
