"use client";

import { useState } from "react";

export function TagInput({
  tags,
  onChange,
  placeholder,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...tags, ...parts])]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-2.5 py-1 text-xs font-medium text-[#1d4ed8]">
            {tag}
            {!disabled ? (
              <button type="button" className="text-[#64748b] hover:text-rose-600" onClick={() => onChange(tags.filter((t) => t !== tag))}>
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {!disabled ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
          placeholder={placeholder ?? "Type and press Enter"}
          className="h-10 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm"
        />
      ) : null}
    </div>
  );
}
