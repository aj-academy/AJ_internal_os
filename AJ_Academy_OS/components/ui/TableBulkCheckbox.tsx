"use client";

type TableBulkCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
  className?: string;
};

export function TableBulkCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  ariaLabel,
  className = "",
}: TableBulkCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      disabled={disabled}
      onChange={onChange}
      aria-label={ariaLabel}
      className={`h-4 w-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#93c5fd] disabled:opacity-40 ${className}`}
    />
  );
}
