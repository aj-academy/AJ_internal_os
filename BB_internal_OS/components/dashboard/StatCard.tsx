import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  description?: string;
  icon: LucideIcon;
  variant?: "default" | "rose";
}

export function StatCard({
  title,
  value,
  trend,
  description,
  icon: Icon,
  variant = "default",
}: StatCardProps) {
  return (
    <Card
      className={[
        "rounded-[20px] border border-[#eee6df] py-0 shadow-[0_6px_18px_rgba(25,23,22,0.06)]",
        variant === "rose" ? "bg-gradient-to-br from-[#f2f7ff] to-[#e5efff]" : "bg-white",
      ].join(" ")}
    >
      <CardHeader className="pb-0 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#edf4ff] text-[#1e40af]">
            <Icon className="h-4 w-4" />
          </span>
          {trend ? (
            <Badge className="rounded-full border border-[#cfe0ff] bg-[#e8f1ff] px-2.5 py-0.5 text-[#1d4ed8] hover:bg-[#e8f1ff]">
              {trend}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-sm font-medium text-[#6d645c]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-5 pt-1">
        <p className="text-3xl font-semibold text-[#191716]">{value}</p>
        {description ? <p className="mt-2 text-xs text-[#8a8178]">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
