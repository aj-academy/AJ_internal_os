"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AcademicDepartment } from "@/types/lms";

type AllocationRow = {
  department_id: string;
  status: string;
};

export type MentorDepartmentScope = {
  /** Departments the mentor may use (User Master first, then active allocations). */
  departments: AcademicDepartment[];
  /** True when exactly one department is in scope — UI should lock the field. */
  locked: boolean;
  lockedDepartmentId: string;
  lockedDepartmentName: string;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

function matchDeptByName(
  catalog: AcademicDepartment[],
  name: string | null,
): AcademicDepartment[] {
  if (!name) return [];
  const key = name.trim().toLowerCase();
  if (!key) return [];
  return catalog.filter((d) => d.name.trim().toLowerCase() === key);
}

/**
 * Resolves the mentor's fixed academic department from User Master
 * (`profiles.department` set when the mentor was created). Falls back to
 * active Academic → Mentor Allocation rows only when the profile has no department.
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

    // User Master department is the source of truth (set when admin creates the mentor).
    const fromProfile = matchDeptByName(catalogDepartments, profileDeptName);
    if (fromProfile.length) return fromProfile;

    if (allocDeptIds.length) {
      return catalogDepartments.filter((d) => allocDeptIds.includes(d.id));
    }

    return [];
  }, [enabled, catalogDepartments, allocDeptIds, profileDeptName]);

  const locked = enabled && (departments.length === 1 || Boolean(profileDeptName));
  const lockedDepartmentId = departments.length === 1 ? departments[0].id : "";
  const lockedDepartmentName =
    departments.length === 1
      ? departments[0].name
      : profileDeptName || "";

  return {
    departments,
    locked: locked && Boolean(lockedDepartmentName || lockedDepartmentId),
    lockedDepartmentId,
    lockedDepartmentName,
    loading,
    error,
    reload,
  };
}

/** Read-only department display for mentors with a fixed User Master assignment. */
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
        value={loading ? "Loading…" : name || "Not assigned"}
        readOnly
        disabled
        title="Your department from User Master"
      />
      <span className="mt-1 block text-xs text-[#64748b]">
        Your assigned department — cannot be changed here.
      </span>
    </label>
  );
}
