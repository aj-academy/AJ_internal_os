"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Page-scoped header checkbox while keeping selection across pages. */
export function buildPageSelectionScope(
  isSelected: (id: string) => boolean,
  onToggle: (id: string) => void,
  pageIds: string[],
) {
  const uniquePageIds = [...new Set(pageIds.filter(Boolean))];
  const allSelected = uniquePageIds.length > 0 && uniquePageIds.every((id) => isSelected(id));
  const someSelected = uniquePageIds.some((id) => isSelected(id)) && !allSelected;
  const onToggleAll = () => {
    const allPageSelected = uniquePageIds.every((id) => isSelected(id));
    for (const id of uniquePageIds) {
      if (allPageSelected && isSelected(id)) onToggle(id);
      else if (!allPageSelected && !isSelected(id)) onToggle(id);
    }
  };
  return { allSelected, someSelected, onToggleAll };
}

export function useRowSelection<T>(items: T[], getId: (item: T) => string, pageItems?: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allIds = useMemo(() => items.map(getId), [items, getId]);
  const idSet = useMemo(() => new Set(allIds), [allIds]);
  const pageIds = useMemo(
    () => (pageItems ? pageItems.map(getId) : allIds),
    [pageItems, getId, allIds],
  );

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => idSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [idSet]);

  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id)) && !allSelected;

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allPageSelected = pageIds.length > 0 && pageIds.every((id) => next.has(id));
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [pageIds]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return {
    selected,
    selectedCount: selected.size,
    allSelected,
    someSelected,
    toggleAll,
    toggleOne,
    clearSelection,
    isSelected,
    setSelected,
  };
}
