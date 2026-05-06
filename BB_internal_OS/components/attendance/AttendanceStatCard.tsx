import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AttendanceStatCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function AttendanceStatCard({ label, value, hint }: AttendanceStatCardProps) {
  return (
    <Card className="rounded-2xl border-[#d4deea] bg-white py-0 shadow-[0_8px_20px_rgba(30,64,175,0.09)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(30,64,175,0.15)]">
      <CardHeader className="pb-0 pt-4">
        <CardTitle className="text-sm font-medium text-slate-600">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-1">
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
