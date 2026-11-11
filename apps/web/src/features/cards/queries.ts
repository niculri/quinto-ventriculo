import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { SearchError, compileSearch, parseSearch, searchNeeds } from '@qv/anki-search';
import type { SearchContext } from '@qv/anki-search';
import { dayOfStart, dayStartsAt } from '@qv/srs';
import type { CardIndex, NoteTypeSummary } from '@qv/schema';
import { useServices } from '../../app/services';
import { ApiRequestError } from '../../lib/api';
import type { AnkiTree } from '../anki/tree';
import { buildBrowseCards, decayFromParams } from '../browse/data';
import type { BrowseCard } from '../browse/data';
import { dayNumber } from '../stats/heatmap';
import { heatmapKeys } from '../stats/queries';
import { studyKeys, useDeckSettings, usePreferences, useUserPresets } from '../study/queries';
import type { StoredCard, StudyPreferences } from '../study/repository';
import { cardKey, presetChoices, presetOf, timingFor } from '../study/scheduler';
import { FAILED_DAYS, explorerNotes } from './model';
import type { ExplorerNote } from './model';
import { lectureOf } from './scope';
import type { CardsScope } from './scope';

export const cardsKeys = {
  index: (assessmentId: string, hash: string) => ['card-index', assessmentId, hash] as const,
  thumbs: ['card-thumbs'] as const,
  /** Under the study's keys: an action of the viewer reads them again. */
  failed: (since: number) => [...studyKeys.all, 'failed', since] as const,
  day: (scope: string, day: string) => [...studyKeys.all, 'cards-day', scope, day] as const,
};

/** An index does not change while its hash is the same (its file is named by its content). */
export function useCardIndexes(scope: CardsScope | null) {
  const { api } = useServices();
  const refs = (scope?.assessments ?? []).flatMap((a) =>
    a.cardIndex ? [{ id: a.id, hash: a.cardIndex.hash }] : [],
  );
  return useQueries({
    queries: refs.map((r) => ({
      queryKey: cardsKeys.index(r.id, r.hash),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.cardIndex(r.id, r.hash, signal),
      staleTime: Infinity,
      gcTime: 30 * 60_000,
    })),
    combine: (results) => ({
      data: results.every((r) => r.data) ? results.map((r) => r.data!) : undefined,
      error: results.find((r) => r.error)?.error ?? null,
      // The file the catalog named is not there any more: the cards changed after the page was opened.
      changed: results.some((r) => r.error instanceof ApiRequestError && r.error.status === 404),
      refetch: () => results.forEach((r) => r.isError && void r.refetch()),
    }),
  });
}

/** One signature for every thumbnail; it lasts at least an hour, asked for again every 10 minutes. */
export function useThumbQuery() {
  const { api } = useServices();
  const q = useQuery({
    queryKey: cardsKeys.thumbs,
    queryFn: ({ signal }) => api.thumbSignature(signal),
    staleTime: 10 * 60_000,
  });
  return q.data?.query ?? null;
}

/** The thumbnail's URL, with the signature. */
export const thumbUrl = (thumb: string, query: string) => `/api/media/${thumb}?${query}`;

/** The student's rows of the scope's decks (only those: step 3.3, ANK-7). */
export function useScopeRows(scope: CardsScope | null) {
  const { study } = useServices();
  return useQuery({
    queryKey: studyKeys.cards(scope?.node.id ?? ''),
    queryFn: () => study.cards(scope!.deckIds),
    enabled: !!scope,
    staleTime: 30_000,
  });
}

/** The cards with an «Otra vez» in the last FAILED_DAYS days (the start of the student's day). */
export function useFailed(prefs: StudyPreferences | undefined, nowMs: number) {
  const { study } = useServices();
  const since = prefs ? timingFor(prefs, nowMs).nextDayAt - FAILED_DAYS * 86_400 : 0;
  return useQuery({
    queryKey: cardsKeys.failed(since),
    queryFn: async () =>
      new Set(
        (await study.ratedSince(new Date(since * 1000)))
          .filter((a) => a.rating === 1)
          .map((a) => cardKey(a)),
      ),
    enabled: !!prefs,
    staleTime: 30_000,
  });
}

/** What the scope's data are, for the list, the table and the practice. */
export interface CardsData {
  indexes: CardIndex[];
  notes: ExplorerNote[];
  /** Every card, as @qv/anki-search and the table see it. */
  cards: BrowseCard[];
  byKey: Map<string, BrowseCard>;
  noteTypes: NoteTypeSummary[];
  rows: StoredCard[];
  prefs: StudyPreferences;
}

/**
 * The index of each assessment of the scope, the student's progress in it and their preferences. While something is
 * missing, `data` is undefined; `missing`: an assessment of the scope has no index yet.
 */
export function useCardsData(scope: CardsScope | null, tree: AnkiTree | null, nowMs: number) {
  const indexes = useCardIndexes(scope);
  const rows = useScopeRows(scope);
  const preferences = usePreferences();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const authorPresets = useAuthorPresets();
  // (Revisión de cero, 3.3: an assessment whose decks have no cards has no index, and is not missing one.)
  const missing = !!scope && scope.assessments.some((a) => !a.cardIndex && a.cardCount > 0);
  const prefs = preferences.prefs;
  const ready =
    !!scope &&
    !!tree &&
    !!indexes.data &&
    !!rows.data &&
    !!prefs &&
    !!presets.data &&
    !!settings.data;
  const data = useMemo<CardsData | undefined>(() => {
    if (!ready) return undefined;
    const choices = presetChoices(authorPresets, presets.data!);
    const decay = new Map(
      tree!.nodes.map((n) => [
        n.id,
        decayFromParams(presetOf(n.id, n.preset, choices, settings.data!).config.fsrsParams),
      ]),
    );
    const byRow = new Map(rows.data!.map((r) => [cardKey(r), r]));
    const list = indexes.data!;
    const notes = explorerNotes(
      list,
      (deckId) => lectureOf(tree!.byId.get(deckId))?.id ?? deckId,
      byRow,
    );
    const noteTypes = uniqueTypes(list);
    const cards = buildBrowseCards(
      list.flatMap((i) => i.notes),
      noteTypes,
      tree!.byId,
      byRow,
      prefs!,
      (id) => decay.get(id) ?? 0.5,
      nowMs,
    );
    return {
      indexes: list,
      notes,
      cards,
      byKey: new Map(cards.map((c) => [c.key, c])),
      noteTypes,
      rows: rows.data!,
      prefs: prefs!,
    };
    // `nowMs` changes every minute: the cards' due dates follow it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, indexes.data, rows.data, prefs, presets.data, settings.data, tree, nowMs]);
  const parts = [rows, preferences, presets, settings];
  const error = indexes.error ?? parts.find((p) => p.isError)?.error ?? null;
  return {
    data,
    missing,
    changed: indexes.changed,
    error: indexes.changed ? null : error,
    retry: () => {
      indexes.refetch();
      parts.forEach((p) => p.isError && void p.refetch());
    },
  };
}

function useAuthorPresets() {
  // The author's presets are in the catalog, already loaded by the page.
  const { api } = useServices();
  const q = useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => api.catalog(signal),
    staleTime: 5 * 60_000,
  });
  return q.data?.anki.presets ?? [];
}

function uniqueTypes(indexes: readonly CardIndex[]): NoteTypeSummary[] {
  const out = new Map<string, NoteTypeSummary>();
  for (const i of indexes) for (const t of i.noteTypes) out.set(t.id, t);
  return [...out.values()];
}

/**
 * The cards a search finds (null: no search), with Anki's syntax and without accents. `rated:` and `introduced:` read
 * the answers they need first (`waiting`).
 */
export function useTextMatch(data: CardsData | undefined, query: string, tree: AnkiTree | null) {
  const { study } = useServices();
  const parsed = useMemo(() => {
    if (!query.trim()) return { node: null, error: null };
    try {
      return { node: parseSearch(query), error: null };
    } catch (e) {
      return { node: null, error: e instanceof SearchError ? e.message : String(e) };
    }
  }, [query]);
  const timing = data ? timingFor(data.prefs) : null;
  const needs = parsed.node ? searchNeeds(parsed.node) : { ratedDays: null, introducedDays: null };
  const ratedSince =
    needs.ratedDays === null || !timing ? null : timing.nextDayAt - needs.ratedDays * 86_400;
  const introducedSince =
    needs.introducedDays === null || !timing
      ? null
      : timing.nextDayAt - needs.introducedDays * 86_400;
  const rated = useQuery({
    queryKey: studyKeys.rated(ratedSince ?? 0),
    queryFn: () => study.ratedSince(new Date(ratedSince! * 1000)),
    enabled: ratedSince !== null,
    staleTime: 30_000,
  });
  const introduced = useQuery({
    queryKey: studyKeys.introduced(introducedSince ?? 0),
    queryFn: () => study.firstAnswersSince(new Date(introducedSince! * 1000)),
    enabled: introducedSince !== null,
    staleTime: 30_000,
  });
  const waiting =
    (ratedSince !== null && !rated.data) || (introducedSince !== null && !introduced.data);
  const result = useMemo(() => {
    if (!parsed.node || !data || !tree || waiting) return { keys: null, error: parsed.error };
    const ctx: SearchContext = {
      decks: tree.nodes.map((n) => ({ id: n.id, name: n.name })),
      noteTypes: data.noteTypes.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        fields: t.fields,
        templates: t.templates,
      })),
      timing: timingFor(data.prefs),
      learnAheadSecs: data.prefs.learnAheadMinutes * 60,
      // «vertebra» finds «vértebra» (Anki's «Ignore accents in search», on here).
      ignoreAccents: true,
      answers: (rated.data ?? []).map((a) => ({
        noteGuid: a.noteGuid,
        ord: a.ord,
        rating: a.rating,
        atMs: Date.parse(a.reviewedAt),
      })),
      firstAnswerMs: new Map(
        (introduced.data ?? []).map((a) => [cardKey(a), Date.parse(a.at)] as const),
      ),
    };
    try {
      const match = compileSearch(parsed.node, ctx);
      return { keys: new Set(data.cards.filter(match).map((c) => c.key)), error: null };
    } catch (e) {
      return { keys: new Set<string>(), error: e instanceof SearchError ? e.message : String(e) };
    }
  }, [parsed, data, tree, waiting, rated.data, introduced.data]);
  return { ...result, waiting: !!parsed.node && waiting };
}

/** Now, for a burial («Saltar por hoy») that has not ended: its end is a day's start. */
const nowOf = (prefs: StudyPreferences) => timingFor(prefs).now * 1000;

/** What a day of the heatmap is on this page: answered (a past day, or today with answers) or due. */
export interface DayCards {
  day: number;
  kind: 'answered' | 'due';
  keys: Set<string>;
  /** Answers of that day of the scope's cards (review_log). */
  answers: number;
  /**
   * Practice that day in the scope's decks (the final review, «Practicar estas»): its cell counts it too, but it is
   * kept by deck, not by card, so the list cannot show it (Revisión de cero, 3.3).
   */
  practice: number;
}

/**
 * The cards of a day of the heatmap (`day`: «2026-11-03»): a past day, those answered that day, read by the range of
 * `reviewed_at`; a day to come, those due that day, from the progress already read. Today: the answered ones if there
 * are, else the due ones, as its cell.
 */
export function useDayCards(
  scope: CardsScope | null,
  data: CardsData | undefined,
  dayParam: string | null,
) {
  const { study } = useServices();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayNumber(dayParam) : null;
  const prefs = data?.prefs;
  const today = prefs ? timingFor(prefs).today : null;
  // The student's days (as the home page's heatmap reads them): the practice of a day, which its cell counts.
  const heat = useQuery({
    queryKey: heatmapKeys.scope('all'),
    queryFn: () => study.heatmap(null),
    enabled: day !== null && today !== null && day <= today,
    staleTime: 5 * 60_000,
  });
  const answered = useQuery({
    queryKey: cardsKeys.day(scope?.node.id ?? '', dayParam ?? ''),
    queryFn: () =>
      study.ratedBetween(
        new Date(dayStartsAt(day!, prefs!.timeZone, prefs!.dayStartsAt) * 1000),
        new Date(dayStartsAt(day! + 1, prefs!.timeZone, prefs!.dayStartsAt) * 1000),
      ),
    enabled: day !== null && !!prefs && today !== null && day <= today,
    staleTime: 30_000,
  });
  const value = useMemo<DayCards | null>(() => {
    if (day === null || !data || today === null) return null;
    const inScope = new Set(data.cards.map((c) => c.key));
    if (day <= today) {
      if (!answered.data || !heat.data) return null;
      const mine = answered.data.filter((a) => inScope.has(cardKey(a)));
      const decks = new Set(scope?.deckIds ?? []);
      const practice = heat.data.days.reduce(
        (t, d) => (d.day === day && decks.has(d.deckId) ? t + d.practice : t),
        0,
      );
      if (day < today || mine.length || practice) {
        return {
          day,
          kind: 'answered',
          keys: new Set(mine.map((a) => cardKey(a))),
          answers: mine.length,
          practice,
        };
      }
    }
    const keys = new Set<string>();
    const nowMs = nowOf(data.prefs);
    for (const r of data.rows) {
      if (!r.interday || r.phase === 'new' || r.due === null || r.suspended || r.retiredAt)
        continue;
      if (r.buriedUntil !== null && Date.parse(r.buriedUntil) > nowMs) continue;
      const key = cardKey(r);
      if (!inScope.has(key)) continue;
      if (
        dayOfStart(Date.parse(r.due) / 1000, data.prefs.timeZone, data.prefs.dayStartsAt) === day
      ) {
        keys.add(key);
      }
    }
    return { day, kind: 'due', keys, answers: 0, practice: 0 };
  }, [day, data, today, answered.data, heat.data, scope]);
  const error = answered.error ?? heat.error;
  return {
    day,
    value,
    error,
    retry: () => {
      if (answered.isError) void answered.refetch();
      if (heat.isError) void heat.refetch();
    },
    waiting: day !== null && !value && !error,
  };
}
