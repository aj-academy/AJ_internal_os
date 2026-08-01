"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  children: ReactNode;
};

/** Native select that stays clickable (no disabled grey-out that feels “broken”). */
export function LmsSelect({ label, hint, className, children, ...rest }: Props) {
  return (
    <label className="block text-sm text-[#334155]">
      {label}
      <select
        {...rest}
        className={[
          "mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] bg-white px-3",
          className || "",
        ].join(" ")}
      >
        {children}
      </select>
      {hint ? <p className="mt-1 text-xs text-[#64748b]">{hint}</p> : null}
    </label>
  );
}
