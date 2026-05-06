interface ProgressBarProps {
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const safe = Math.max(0, Math.min(100, value));

  return (
    <div className="w-full min-w-[130px]">
      <div className="h-2 rounded-full bg-[#dbe6f3]">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#60a5fa]"
          style={{ width: `${safe}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-[#64748b]">{safe}%</p>
    </div>
  );
}
