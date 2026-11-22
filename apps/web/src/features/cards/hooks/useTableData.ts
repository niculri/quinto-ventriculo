// The table's data from its sources, built again only when one of them changes.
import { useMemo } from 'react';
import { tableData } from '../model/tableData';
import type { TableSources } from '../model/tableData';

export function useTableData({
  notes,
  noteTypes,
  authorPresets,
  tree,
  rows,
  prefs,
  presets,
  settings,
  draftOnly,
}: Omit<TableSources, 'roots'>) {
  // By hand, from the fields of the sources: the compiler would depend on the object, new in each render.
  return useMemo(
    () =>
      tableData({
        notes,
        noteTypes,
        authorPresets,
        tree,
        rows,
        prefs,
        presets,
        settings,
        draftOnly,
      }),
    [notes, noteTypes, authorPresets, tree, rows, prefs, presets, settings, draftOnly],
  );
}
