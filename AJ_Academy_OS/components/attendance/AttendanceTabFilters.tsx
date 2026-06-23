"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TableSearchBar } from "@/components/ui/TableSearchBar";

type AttendanceTabFiltersProps = {
  tab: string;
  placeholder?: string;
};

export function AttendanceTabFilters({ tab, placeholder = "Search name or email…" }: AttendanceTabFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      const q = search.trim();
      if (q) params.set("q", q);
      else params.delete("q");
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) router.replace(`/admin/attendance?${next}`);
    }, 350);
    return () => clearTimeout(timer);
  }, [router, search, searchParams, tab]);

  const filtersActive = Boolean(
    search.trim() ||
      searchParams.get("date") ||
      searchParams.get("department") ||
      searchParams.get("status") ||
      searchParams.get("location") ||
      searchParams.get("employee"),
  );

  const clearFilters = () => {
    setSearch("");
    router.replace(`/admin/attendance?tab=${tab}`);
  };

  return (
    <TableSearchBar
      value={search}
      onChange={setSearch}
      placeholder={placeholder}
      showClear={filtersActive}
      onClear={clearFilters}
    />
  );
}
