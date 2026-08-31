import { Suspense } from "react";

import { AnalyticsWorkbench } from "@/components/analytics/AnalyticsWorkbench";

export default function AdminReportsAnalyticsPage() {
  // The workbench reads ?report= to pick the selected report.
  return (
    <Suspense fallback={null}>
      <AnalyticsWorkbench mode="admin" />
    </Suspense>
  );
}
