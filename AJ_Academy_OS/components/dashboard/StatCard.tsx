import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  description?: string;
  hint?: string;
  icon?: LucideIcon;
  variant?: "default" | "accent";
}

export function StatCard({
  title,
  value,
  trend,
  description,
  hint,
  icon: Icon = Circle,
  variant = "default",
}: StatCardProps) {
  const subtext = description ?? hint;

  return (
    <Card
      className={cn(
        "rounded-[1rem] border border-[#e8dcc8]/90 py-0 shadow-[0_1px_2px_rgba(61,52,40,0.04),0_8px_24px_rgba(61,52,40,0.05)]",
        variant === "accent" ? "bg-[#faf3e3]/55" : "bg-white",
      )}
    >
      <CardHeader className="pb-0 pt-4 sm:pt-5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#faf3e3] text-[#c9a227] ring-1 ring-[#e8dcc8]/70">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {trend ? (
            <Badge variant="secondary" className="rounded-full px-2.5">
              {trend}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-sm font-medium tracking-normal text-[#6b5d4d]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-1 sm:pb-5">
        <p className="text-2xl font-semibold tracking-tight text-[#3d3428] sm:text-3xl">
          {value}
        </p>
        {subtext ? <p className="mt-1.5 text-xs leading-relaxed text-[#6b5d4d]">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
