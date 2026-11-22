// The cards pages' data: the indexes of the scope's assessments, the student's rows, preferences and presets, built
// into the list's notes and the table's cards (again every minute, as the due dates follow the time).

import { useQueries, useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { ApiRequestError } from '../../../shared/lib/api';
import { useStudyRepository } from '../../progress/api/context';
import { useDeckSettings, usePreferences, useUserPresets } from '../../progress/queries';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import type { AnkiTree } from '../../catalog/model/tree';
import type { CardsScope } from '../../catalog/model/scope';
import { cardsData } from '../model/cardsData';
import type { CardsData } from '../model/cardsData';
import { cardIndexQuery, scopeRowsQuery } from '../api/queries';
import { useDraftOnlyKeys } from './useDraftOnlyKeys';

// One empty list while the catalog loads: the same one in each render, as the data depends on it.
const NO_PRESETS: never[] = [];

function useCardIndexes(scope: CardsScope | null) {
  const api = useApi();
  const refs = (scope?.assessments ?? []).flatMap((a) =>
    a.cardIndex ? [{ id: a.id, hash: a.cardIndex.hash }] : [],
  );
  return useQueries({
    queries: refs.map((r) => cardIndexQuery(api, r)),
    combine: (results) => ({
      data: results.every((r) => r.data) ? results.map((r) => r.data!) : undefined,
      error: results.find((r) => r.error)?.error ?? null,
      // The file the catalog named is not there any more: the cards changed after the page was opened.
      changed: results.some((r) => r.error instanceof ApiRequestError && r.error.status === 404),
      refetch: () => results.forEach((r) => r.isError && void r.refetch()),
    }),
  });
}

function useScopeRows(scope: CardsScope | null) {
  const study = useStudyRepository();
  return useQuery(scopeRowsQuery(study, scope));
}

export function useCardsData(scope: CardsScope | null, tree: AnkiTree | null, nowMs: number) {
  const indexes = useCardIndexes(scope);
  const draftOnly = useDraftOnlyKeys(scope, indexes.data);
  const rows = useScopeRows(scope);
  const preferences = usePreferences();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const authorPresets = useCatalog().data?.anki.presets ?? NO_PRESETS;
  // An assessment whose decks have no cards has no index, and is not missing one.
  const missing = !!scope && scope.assessments.some((a) => !a.cardIndex && a.cardCount > 0);
  const prefs = preferences.prefs;
  // Each `data` is read before the condition: the compiler depends on a property only when it reads it without one.
  const list = indexes.data;
  const keys = draftOnly.keys;
  const rowsData = rows.data;
  const presetsData = presets.data;
  const settingsData = settings.data;
  const data: CardsData | undefined =
    scope && tree && list && keys && rowsData && prefs && presetsData && settingsData
      ? cardsData({
          list,
          rows: rowsData,
          draftOnly: keys,
          prefs,
          authorPresets,
          presets: presetsData,
          settings: settingsData,
          tree,
          nowMs,
        })
      : undefined;
  const parts = [rows, preferences, presets, settings];
  const error = indexes.error ?? draftOnly.error ?? parts.find((p) => p.isError)?.error ?? null;
  return {
    data,
    missing,
    changed: indexes.changed,
    error: indexes.changed ? null : error,
    retry: () => {
      indexes.refetch();
      draftOnly.refetch();
      parts.forEach((p) => p.isError && void p.refetch());
    },
  };
}
