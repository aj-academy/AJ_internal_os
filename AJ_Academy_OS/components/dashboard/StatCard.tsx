import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
      className={[
        "rounded-[20px] border border-[#e8dcc8] py-0 shadow-[0_6px_18px_rgba(61,52,40,0.06)]",
        variant === "accent" ? "bg-gradient-to-br from-[#faf3e3] to-[#fffdf8]" : "bg-white",
      ].join(" ")}
    >
      <CardHeader className="pb-0 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#faf3e3] text-[#c9a227]">
            <Icon className="h-4 w-4" />
          </span>
          {trend ? (
            <Badge className="rounded-full border border-[#e8dcc8] bg-[#faf3e3] px-2.5 py-0.5 text-[#a68b2e] hover:bg-[#faf3e3]">
              {trend}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-sm font-medium text-[#6b5d4d]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-5 pt-1">
        <p className="text-3xl font-semibold text-[#3d3428]">{value}</p>
        {subtext ? <p className="mt-2 text-xs text-[#6b5d4d]">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
