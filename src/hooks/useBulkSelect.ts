// src/hooks/useBulkSelect.ts
// Mobile counterpart of inclufy-marketing-web/src/hooks/useBulkSelect.ts.
// Closes the last P2 web↔mobile parity gap from the 2026-06-09 audit
// for the multi-select pattern.
//
// Mobile UX adjustments vs web:
// - selectRange is exposed but mobile rarely uses it (no shift-click;
//   gesture-based range select is out of scope here)
// - The toggle pattern is invoked from long-press on a list row
//
// Usage:
//   const sel = useBulkSelect(posts, (p) => p.id);
//   on long-press: sel.toggle(post.id)
//   if sel.count > 0 render BulkActionBar with sel.clear / bulk handler

import { useCallback, useMemo, useState } from 'react';

export interface BulkSelectApi<T> {
  selectedIds: string[];
  selectedItems: T[];
  count: number;
  allSelected: boolean;
  someSelected: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string, next?: boolean) => void;
  toggleAll: (next?: boolean) => void;
  clear: () => void;
  selectRange: (anchorId: string, targetId: string) => void;
}

export function useBulkSelect<T>(items: T[], getId: (item: T) => string): BulkSelectApi<T> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  const itemsIndex = useMemo(() => {
    const m = new Map<string, T>();
    for (const it of items) m.set(getId(it), it);
    return m;
  }, [items, getId]);

  const selectedIds = useMemo(() => Array.from(ids), [ids]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => itemsIndex.get(id)).filter(Boolean) as T[],
    [selectedIds, itemsIndex],
  );

  const allSelected = items.length > 0 && ids.size === items.length;
  const someSelected = ids.size > 0 && !allSelected;

  const isSelected = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback((id: string, next?: boolean) => {
    setIds((cur) => {
      const n = new Set(cur);
      const want = next ?? !n.has(id);
      if (want) n.add(id); else n.delete(id);
      return n;
    });
  }, []);

  const toggleAll = useCallback((next?: boolean) => {
    setIds((cur) => {
      const want = next ?? cur.size < items.length;
      if (!want) return new Set();
      const n = new Set<string>();
      for (const it of items) n.add(getId(it));
      return n;
    });
  }, [items, getId]);

  const clear = useCallback(() => setIds(new Set()), []);

  const selectRange = useCallback((anchorId: string, targetId: string) => {
    const i1 = items.findIndex((it) => getId(it) === anchorId);
    const i2 = items.findIndex((it) => getId(it) === targetId);
    if (i1 < 0 || i2 < 0) return;
    const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
    setIds((cur) => {
      const n = new Set(cur);
      for (let i = lo; i <= hi; i++) n.add(getId(items[i]));
      return n;
    });
  }, [items, getId]);

  return {
    selectedIds, selectedItems, count: ids.size,
    allSelected, someSelected, isSelected,
    toggle, toggleAll, clear, selectRange,
  };
}
