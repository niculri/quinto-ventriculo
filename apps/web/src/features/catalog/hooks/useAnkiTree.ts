// The catalog and its deck tree, built once per catalog.

import { useCatalog } from './useCatalog';
import { buildAnkiTree } from '../model/tree';

export function useAnkiTree() {
  const catalog = useCatalog();
  const tree = catalog.data ? buildAnkiTree(catalog.data) : null;
  return { catalog, tree };
}
