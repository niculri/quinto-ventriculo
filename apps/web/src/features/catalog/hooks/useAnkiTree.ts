// The catalog and its deck tree, built once per catalog.
import { useMemo } from 'react';
import { useCatalog } from './useCatalog';
import { buildAnkiTree } from '../model/tree';

export function useAnkiTree() {
  const catalog = useCatalog();
  const tree = useMemo(() => (catalog.data ? buildAnkiTree(catalog.data) : null), [catalog.data]);
  return { catalog, tree };
}
