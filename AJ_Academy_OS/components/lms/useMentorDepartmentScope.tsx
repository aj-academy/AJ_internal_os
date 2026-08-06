"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AcademicDepartment } from "@/types/lms";

type AllocationRow = {
  department_id: string;
  status: string;
};

export type MentorDepartmentScope = {
  /** Departments the mentor may use (from active allocations, else profile name match). */
  departments: AcademicDepartment[];
  /** True when exactly one department is in scope — UI should lock the field. */
  locked: boolean;
  lockedDepartmentId: string;
  lockedDepartmentName: string;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Resolves the mentor's fixed academic department(s) from Admin allocations
 * (and profile.department name as fallback). Used to lock LMS create forms.
 */
export function useMentorDepartmentScope(
  enabled: boolean,
  catalogDepartments: AcademicDepartment[],
): MentorDepartmentScope {
  const [allocDeptIds, setAllocDeptIds] = useState<string[]>([]);
  const [profileDeptName, setProfileDeptName] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setAllocDeptIds([]);
      setProfileDeptName(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setAllocDeptIds([]);
        setProfileDeptName(null);
        return;
      }

      const [{ data: allocs }, { data: profile }] = await Promise.all([
        supabase
          .from("mentor_allocations")
          .select("department_id,status")
          .eq("mentor_id", user.id),
        supabase.from("profiles").select("department").eq("id", user.id).maybeSingle(),
      ]);

      const activeIds = [
        ...new Set(
          ((allocs as AllocationRow[]) ?? [])
            .filter((a) => (a.status || "").toLowerCase() === "active" && a.department_id)
            .map((a) => a.department_id),
        ),
      ];
      setAllocDeptIds(activeIds);
      setProfileDeptName(
        typeof profile?.department === "string" && profile.department.trim()
          ? profile.department.trim()
          : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load mentor department.");
      setAllocDeptIds([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const departments = useMemo(() => {
    if (!enabled) return catalogDepartments;
    if (allocDeptIds.length) {
      return catalogDepartments.filter((d) => allocDeptIds.includes(d.id));
    }
    if (profileDeptName) {
      const key = profileDeptName.toLowerCase();
      const matched = catalogDepartments.filter((d) => d.name.trim().toLowerCase() === key);
      if (matched.length) return matched;
    }
    return [];
  }, [enabled, catalogDepartments, allocDeptIds, profileDeptName]);

  const locked = enabled && departments.length === 1;
  const lockedDepartmentId = locked ? departments[0].id : "";
  const lockedDepartmentName = locked
    ? departments[0].name
    : profileDeptName && !departments.length
      ? profileDeptName
      : "";

  return {
    departments,
    locked,
    lockedDepartmentId,
    lockedDepartmentName,
    loading,
    error,
    reload,
  };
}

/** Read-only department display for mentors with a fixed admin assignment. */
export function MentorLockedDepartmentField({
  name,
  loading,
}: {
  name: string;
  loading?: boolean;
}) {
  return (
    <label className="text-sm">
      Department
      <input
        className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border border-[#dbe6f3] bg-[#f8fafc] px-3 text-[#0f172a]"
        value={loading ? "Loading…" : name || "Not assigned by admin"}
        readOnly
        disabled
        title="Fixed by admin allocation / User Master department"
      />
      <span className="mt-1 block text-xs text-[#64748b]">
        Set by admin — mentors cannot change department.
      </span>
    </label>
  );
}
