"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { HrOrgSettingsPanel } from "@/components/settings/HrOrgSettingsPanel";

export default function AcademicDepartmentsCoursesPage() {
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const syncToLms = async () => {
    setSeeding(true);
    setToast(null);
    try {
      const res = await fetch("/api/lms/academic?seed=1", { credentials: "include" });
      const json = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        setToast({ type: "err", text: json.error || json.hint || "Could not sync to LMS catalog." });
        return;
      }
      setToast({
        type: "ok",
        text: "Synced into LMS catalog and student enrolments. Next: open LMS Catalog to add batches and subjects.",
      });
    } catch (e) {
      setToast({ type: "err", text: e instanceof Error ? e.message : "Sync failed." });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Academic management"
        title="Departments & Courses"
        description="Same lists used in User Master for profile department/course. Sync them into the LMS catalog for assignments, mentor allocation, and batches."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-[#e8dcc8]"
              disabled={seeding}
              onClick={() => void syncToLms()}
            >
              {seeding ? "Syncing…" : "Sync to LMS catalog"}
            </Button>
            <Link href="/admin/academic/catalog">
              <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]">Open LMS Catalog</Button>
            </Link>
          </div>
        }
      />

      {toast ? (
        <CrmFlash
          tone={toast.type === "ok" ? "success" : "error"}
          message={toast.text}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        <HrOrgSettingsPanel
          schemaMissing={false}
          onToast={(type, text) => setToast({ type, text })}
        />
      </div>
    </section>
  );
}
