import { cn } from "@/lib/utils";

export interface AttendanceTab {
  id: string;
  label: string;
}

interface AttendanceTabsProps {
  tabs: AttendanceTab[];
  value: string;
  onChange: (id: string) => void;
}

export function AttendanceTabs({ tabs, value, onChange }: AttendanceTabsProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#dbe7ff] bg-[#f8fbff] p-2">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const isActive = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-[#2563eb] text-white shadow-[0_8px_18px_rgba(37,99,235,0.24)]"
                  : "bg-white text-slate-700 hover:bg-[#eaf1ff]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
