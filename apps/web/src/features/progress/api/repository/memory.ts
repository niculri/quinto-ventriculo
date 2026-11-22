// A browser copy of the user's study data with the same rules as the database, for the demo, the administrator's
// admin mode and the tests.
import { dayOf, dayOfStart, retrievability } from '@qv/srs';
import { dayNumber, isoOfDay } from '@qv/study';
import type { StudyRepository } from './port';
import {
  CardChangedError,
  defaultPreferences,
  PRACTICE_BATCH_DECKS,
  PRACTICE_BATCH_MAX,
  PRACTICE_DAY_MAX,
  PracticeRefusedError,
} from './model';
import type {
  ActionName,
  AssessmentSetting,
  CardKey,
  CardRef,
  DeckActivation,
  DeckProgress,
  DeckSetting,
  HomeDeckCounts,
  QueueName,
  StoredCard,
  StudyPreferences,
  UserPreset,
} from './model';
import { storageKeys } from '../../../../shared/lib/storage';

const MIN_ANSWERS_FOR_MEDIAN = 20;
const UNDO_MS = 48 * 3_600_000;
const MAX_CHANGES = 2000;
const MAX_HOME_DUE = 20_000;
const MAX_DECKS = 5000;

interface LogRow extends CardRef {
  id: number;
  actionId: string;
  action: ActionName;
  reviewedAt: string;
  rating: number | null;
  queueBefore: QueueName | null;
  before: StoredCard | null;
  after: StoredCard;
  /** What an answer sends (null for the other changes); absent in what was kept before. */
  interval?: number | null;
  durationMs?: number | null;
  /** When it was written, for the 48 hours of undo, and its study day then (as review_log.study_day). */
  loggedAt?: string;
  day?: number;
}

interface LocalData {
  cards: StoredCard[];
  log: LogRow[];
  presets: UserPreset[];
  settings: DeckSetting[];
  preferences: StudyPreferences | null;
  activations: DeckActivation[];
  assessments: AssessmentSetting[];
  syncedTo?: number;
  practice?: { day: string; deckId: string; n: number }[];
}

const empty = (): LocalData => ({
  cards: [],
  log: [],
  presets: [],
  settings: [],
  preferences: null,
  activations: [],
  assessments: [],
});

/** The zone and the hour the day starts as the database takes them: Santiago and 4:00 without preferences. */
const dayRule = (d: LocalData) => ({
  timeZone: d.preferences?.timeZone ?? 'America/Santiago',
  dayStartsAt: d.preferences?.dayStartsAt ?? 4,
});
const studyDay = (d: LocalData, atMs: number) => {
  const rule = dayRule(d);
  return dayOf(atMs / 1000, rule.timeZone, rule.dayStartsAt);
};

/** median_answer_ms(): the median of the last 500 answers with a time, rounded as Postgres rounds (half to even). */
function medianOf(log: LogRow[]): number | null {
  const recent = log
    .filter((l) => l.rating !== null && typeof l.durationMs === 'number')
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.id - a.id)
    .slice(0, 500)
    .map((l) => l.durationMs!)
    .sort((a, b) => a - b);
  if (recent.length < MIN_ANSWERS_FOR_MEDIAN) return null;
  const mid = (recent.length - 1) / 2;
  const value = (recent[Math.floor(mid)]! + recent[Math.ceil(mid)]!) / 2;
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The checks of home_counts() and study_heatmap() on what they are asked. */
function checkDecks(deckIds: string[] | null, decay: Record<string, number> = {}) {
  if ((deckIds?.length ?? 0) > MAX_DECKS) return 'too_large';
  const bad = Object.values(decay).some((v) => typeof v !== 'number' || !(v >= 0.01 && v <= 2));
  return bad ? 'invalid_decay' : null;
}

/** The decks of a batch of practice as record_practice() takes them: each once, in the order of the batch. */
function practiceBatch(counts: { deckId: string; n: number }[]) {
  const decks = counts.filter((c) => c.n > 0);
  const total = decks.reduce((t, c) => t + c.n, 0);
  if (decks.length > PRACTICE_BATCH_DECKS || total > PRACTICE_BATCH_MAX) return 'too_large';
  const byDeck = new Map<string, number>();
  for (const c of decks) byDeck.set(c.deckId, (byDeck.get(c.deckId) ?? 0) + c.n);
  return [...byDeck].map(([deckId, n]) => ({ deckId, n }));
}

export function localStudyRepository(
  storage: Storage | null = safeLocalStorage(),
  preferences?: Partial<StudyPreferences>,
): StudyRepository {
  const KEY = storageKeys.demo.study;
  let memory: LocalData = {
    ...empty(),
    preferences: preferences ? { ...defaultPreferences(), ...preferences } : null,
  };
  const read = (): LocalData => {
    // A copy, as the database would give: what was read does not change under whoever holds it.
    if (!storage) return structuredClone(memory);
    try {
      return { ...empty(), ...(JSON.parse(storage.getItem(KEY) ?? 'null') as LocalData | null) };
    } catch {
      return empty();
    }
  };
  const write = (d: LocalData) => {
    memory = d;
    try {
      storage?.setItem(KEY, JSON.stringify(d));
    } catch {
      // full or blocked storage: it stays in memory for this visit
    }
  };
  // A moment strictly later than the last one written (two changes in the same millisecond are not equal).
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  const same = (a: CardKey, b: CardKey) => a.noteGuid === b.noteGuid && a.ord === b.ord;
  const blank = (ref: CardRef): StoredCard => ({
    ...ref,
    phase: 'new',
    interday: false,
    remainingSteps: 0,
    due: null,
    interval: 0,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
    lastReview: null,
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: '',
    retiredAt: null,
  });
  let nextId = 1;
  const uuid = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  function change(
    d: LocalData,
    actionId: string,
    action: ActionName,
    ref: CardRef,
    at: string,
    patch: Partial<StoredCard>,
    row?: Partial<LogRow>,
  ): boolean {
    const i = d.cards.findIndex((c) => same(c, ref));
    const before = i >= 0 ? d.cards[i]! : null;
    // Anki does not bury a suspended card (burying: a time; unburying passes).
    if (patch.buriedUntil && before?.suspended) return false;
    const base = before ?? blank(ref);
    const after: StoredCard = {
      ...base,
      ...patch,
      deckId: before?.deckId ?? ref.deckId,
      ...('suspended' in patch && !('buriedUntil' in patch) ? { buriedUntil: null } : {}),
      updatedAt: stamp(),
    };
    if (i >= 0) d.cards[i] = after;
    else d.cards.push(after);
    nextId = Math.max(nextId, ...d.log.map((l) => l.id + 1));
    d.log.push({
      id: nextId++,
      actionId,
      action,
      noteGuid: ref.noteGuid,
      ord: ref.ord,
      deckId: ref.deckId,
      reviewedAt: at,
      rating: null,
      queueBefore: null,
      before,
      after,
      interval: null,
      durationMs: null,
      loggedAt: new Date().toISOString(),
      day: studyDay(d, Date.parse(at)),
      ...row,
    });
    return true;
  }

  function browseChange(
    d: LocalData,
    actionId: string,
    action: ActionName,
    ref: CardRef,
    at: string,
    patch: Partial<StoredCard>,
  ) {
    const before = d.cards.find((c) => same(c, ref));
    if (!before) return;
    const next = { ...before, ...patch };
    if (
      JSON.stringify({ ...next, updatedAt: '' }) === JSON.stringify({ ...before, updatedAt: '' })
    ) {
      return;
    }
    change(d, actionId, action, ref, at, patch);
  }

  return {
    async cards(deckIds) {
      const ids = new Set(deckIds);
      return read().cards.filter((c) => ids.has(c.deckId));
    },
    async allCards() {
      return read().cards;
    },
    async cardLog(card) {
      return read()
        .log.filter((l) => same(l, card))
        .map((l) => ({
          action: l.action,
          reviewedAt: l.reviewedAt,
          rating: l.rating,
          queueBefore: l.queueBefore,
          phaseBefore: l.before?.phase ?? 'new',
          phaseAfter: l.after.phase,
          interval:
            l.interval !== undefined ? l.interval : l.rating === null ? null : l.after.interval,
          stability: l.after.stability,
          difficulty: l.after.difficulty,
          durationMs: l.durationMs ?? null,
        }));
    },
    async ratedSince(since) {
      return read()
        .log.filter((l) => l.rating !== null && Date.parse(l.reviewedAt) >= since.getTime())
        .map((l) => ({
          noteGuid: l.noteGuid,
          ord: l.ord,
          rating: l.rating as 1 | 2 | 3 | 4,
          reviewedAt: l.reviewedAt,
        }));
    },
    async ratedBetween(from, to) {
      return read()
        .log.filter((l) => {
          const at = Date.parse(l.reviewedAt);
          return l.rating !== null && at >= from.getTime() && at < to.getTime();
        })
        .map((l) => ({
          noteGuid: l.noteGuid,
          ord: l.ord,
          deckId: l.deckId,
          rating: l.rating as 1 | 2 | 3 | 4,
          reviewedAt: l.reviewedAt,
        }));
    },
    async firstAnswersSince(since) {
      const first = new Map<string, LogRow>();
      for (const l of read().log) {
        if (l.rating === null) continue;
        const k = `${l.noteGuid}\u001f${l.ord}`;
        if (!first.has(k)) first.set(k, l);
      }
      return [...first.values()]
        .filter((l) => Date.parse(l.reviewedAt) >= since.getTime())
        .map((l) => ({ noteGuid: l.noteGuid, ord: l.ord, at: l.reviewedAt }));
    },
    async answersSince(since) {
      return read()
        .log.filter((l) => l.rating !== null && Date.parse(l.reviewedAt) >= since.getTime())
        .map((l) => ({ deckId: l.deckId, queueBefore: l.queueBefore! }));
    },
    async preferences() {
      const saved = read().preferences;
      return saved ? { ...defaultPreferences(saved.timeZone), ...saved } : null;
    },
    async savePreferences(p) {
      write({ ...read(), preferences: p });
    },
    async presets() {
      return read().presets;
    },
    async savePreset({ id, name, replaces, config }) {
      const d = read();
      if (!id && replaces && d.presets.some((p) => p.replaces === replaces)) {
        throw new Error('No se pudo guardar las opciones: ya existe.');
      }
      const preset: UserPreset = { id: id ?? uuid(), name, replaces, config, updatedAt: stamp() };
      // An edit keeps its place: the database lists them in the order they were made.
      const kept = d.presets.some((p) => p.id === preset.id);
      const presets = kept
        ? d.presets.map((p) => (p.id === preset.id ? preset : p))
        : [...d.presets, preset];
      write({ ...d, presets });
      return preset;
    },
    async deletePreset(id) {
      const d = read();
      write({
        ...d,
        presets: d.presets.filter((p) => p.id !== id),
        settings: d.settings.filter((s) => s.presetId !== id),
      });
    },
    async deckSettings() {
      return read().settings;
    },
    async setDeckPreset(deckId, choice) {
      const d = read();
      const rest = d.settings.filter((s) => s.deckId !== deckId);
      write({
        ...d,
        settings: choice
          ? [
              ...rest,
              {
                deckId,
                presetId: 'presetId' in choice ? choice.presetId : null,
                authorPreset: 'authorPreset' in choice ? choice.authorPreset : null,
              },
            ]
          : rest,
      });
    },
    async deckActivations() {
      return read().activations;
    },
    async setDeckActivation(deckId, active) {
      const d = read();
      write({
        ...d,
        activations: [...d.activations.filter((a) => a.deckId !== deckId), { deckId, active }],
      });
    },
    async assessmentSettings() {
      return read().assessments;
    },
    async saveAssessmentSetting(setting) {
      const d = read();
      write({
        ...d,
        assessments: [...d.assessments.filter((a) => a.deckId !== setting.deckId), setting],
      });
    },
    async deckProgress(dayStart) {
      const d = read();
      const start = dayStart.getTime();
      const halfDay = 43_200_000;
      const out = new Map<string, DeckProgress>();
      const of = (deckId: string) => {
        let p = out.get(deckId);
        if (!p) {
          p = { deckId, seen: 0, newSuspended: 0, overdue: 0, newToday: 0, newYesterday: 0 };
          out.set(deckId, p);
        }
        return p;
      };
      for (const c of d.cards) {
        if (c.retiredAt) continue;
        const p = of(c.deckId);
        if (c.phase === 'new') {
          if (c.suspended) p.newSuspended++;
          continue;
        }
        p.seen++;
        const buried = c.buriedUntil !== null && Date.parse(c.buriedUntil) >= start - halfDay;
        if (
          c.interday &&
          !c.suspended &&
          !buried &&
          c.due !== null &&
          Date.parse(c.due) < start - halfDay
        ) {
          p.overdue++;
        }
      }
      for (const l of d.log) {
        if (l.rating === null || l.queueBefore !== 'new') continue;
        const at = Date.parse(l.reviewedAt);
        if (at >= start) of(l.deckId).newToday++;
        else if (at >= start - 86_400_000) of(l.deckId).newYesterday++;
      }
      return [...out.values()];
    },
    async answeredDecks() {
      const answered = read().cards.filter(
        (c) => (c.phase !== 'new' || c.reps > 0) && !c.retiredAt,
      );
      return [...new Set(answered.map((c) => c.deckId))];
    },
    async medianAnswerMs() {
      return medianOf(read().log);
    },
    async heatmap(deckIds) {
      const refused = checkDecks(deckIds);
      if (refused) throw new Error(`No se pudo leer tus días de estudio: ${refused}`);
      const d = read();
      const prefs = dayRule(d);
      const only = deckIds === null ? null : new Set(deckIds);
      const nowSecs = Date.now() / 1000;
      const today = dayOf(nowSecs, prefs.timeZone, prefs.dayStartsAt);
      const days = new Map<
        string,
        { day: number; deckId: string; answers: number; practice: number }
      >();
      const add = (day: number, deckId: string, answers: number, practice: number) => {
        if (only && !only.has(deckId)) return;
        const key = `${day}:${deckId}`;
        const row = days.get(key) ?? { day, deckId, answers: 0, practice: 0 };
        row.answers += answers;
        row.practice += practice;
        days.set(key, row);
      };
      for (const l of d.log) {
        if (l.rating === null) continue;
        add(l.day ?? studyDay(d, Date.parse(l.reviewedAt)), l.deckId, 1, 0);
      }
      for (const p of d.practice ?? []) add(dayNumber(p.day), p.deckId, 0, p.n);
      const due = new Map<number, number>();
      for (const c of d.cards) {
        if (only && !only.has(c.deckId)) continue;
        if (!c.interday || c.phase === 'new' || c.due === null || c.suspended || c.retiredAt)
          continue;
        if (c.buriedUntil !== null && Date.parse(c.buriedUntil) > Date.now()) continue;
        const day = dayOfStart(Date.parse(c.due) / 1000, prefs.timeZone, prefs.dayStartsAt);
        if (day >= today) due.set(day, (due.get(day) ?? 0) + 1);
      }
      return {
        days: [...days.values()].sort((a, b) => a.day - b.day || a.deckId.localeCompare(b.deckId)),
        due: [...due].sort((a, b) => a[0] - b[0]).map(([day, cards]) => ({ day, cards })),
      };
    },
    async recordPractice(counts) {
      const decks = practiceBatch(counts);
      if (typeof decks === 'string') {
        throw new PracticeRefusedError(`No se pudo guardar tu repaso: ${decks}`);
      }
      if (!decks.length) return;
      const d = read();
      const day = isoOfDay(studyDay(d, Date.now()));
      const practice = [...(d.practice ?? [])];
      let room = PRACTICE_DAY_MAX - practice.reduce((t, p) => t + (p.day === day ? p.n : 0), 0);
      for (const c of decks) {
        const n = Math.min(c.n, Math.max(0, room));
        if (n === 0) break;
        room -= n;
        const i = practice.findIndex((p) => p.day === day && p.deckId === c.deckId);
        if (i >= 0) practice[i] = { ...practice[i]!, n: practice[i]!.n + n };
        else practice.push({ day, deckId: c.deckId, n });
      }
      write({ ...d, practice });
    },
    async recordReview(input) {
      // In the order record_review() checks them; the answer's time is the device's, within a day of now.
      if (input.bury.length > 100) throw new Error('No se pudo guardar tu respuesta: too_large');
      const d = read();
      const current = d.cards.find((c) => same(c, input.card)) ?? null;
      if ((current?.updatedAt ?? null) !== input.expectedUpdatedAt) throw new CardChangedError();
      const last = input.state.lastReview;
      if (last !== null && Math.abs(Date.parse(last) - Date.now()) > 86_400_000) {
        throw new Error('No se pudo guardar tu respuesta: invalid_time');
      }
      const actionId = uuid();
      const at = input.state.lastReview ?? new Date().toISOString();
      change(
        d,
        actionId,
        'answer',
        input.card,
        at,
        {
          ...input.state,
          suspended: (current?.suspended ?? false) || input.state.suspended,
          leech: (current?.leech ?? false) || input.state.leech,
        },
        {
          rating: input.rating,
          queueBefore: input.queueBefore,
          interval: input.interval,
          durationMs: input.durationMs,
        },
      );
      for (const sibling of input.bury) {
        change(d, actionId, 'answer', sibling, at, { buriedUntil: input.buriedUntil });
      }
      write(d);
      return { updatedAt: d.cards.find((c) => same(c, input.card))!.updatedAt };
    },
    async bury(cards, until, note) {
      const d = read();
      const actionId = uuid();
      // One moment for the whole action, as the database's now().
      const at = new Date().toISOString();
      for (const c of cards) {
        change(d, actionId, note ? 'bury_note' : 'bury_card', c, at, {
          buriedUntil: until.toISOString(),
        });
      }
      write(d);
    },
    async suspend(cards, note) {
      const d = read();
      const actionId = uuid();
      const at = new Date().toISOString();
      for (const c of cards) {
        change(d, actionId, note ? 'suspend_note' : 'suspend_card', c, at, { suspended: true });
      }
      write(d);
    },
    async setFlag(card, flag) {
      if (!validFlag(flag)) throw new Error('No se pudo marcar la tarjeta: invalid_flag');
      const d = read();
      change(d, uuid(), 'flag', card, new Date().toISOString(), { flag });
      write(d);
    },
    async setFlags(cards, flag) {
      if (!validFlag(flag)) throw new Error('No se pudo marcar las tarjetas: invalid_flag');
      const d = read();
      const actionId = uuid();
      const at = new Date().toISOString();
      for (const c of cards) {
        if ((d.cards.find((x) => same(x, c))?.flag ?? 0) === flag) continue;
        change(d, actionId, 'flag', c, at, { flag });
      }
      write(d);
    },
    async unsuspend(cards) {
      const d = read();
      const actionId = uuid();
      const at = new Date().toISOString();
      for (const c of cards) browseChange(d, actionId, 'unsuspend', c, at, { suspended: false });
      write(d);
    },
    async unbury(cards) {
      const d = read();
      const actionId = uuid();
      const at = new Date().toISOString();
      for (const c of cards) browseChange(d, actionId, 'unbury', c, at, { buriedUntil: null });
      write(d);
    },
    async forget(cards, resetCounts) {
      const d = read();
      const actionId = uuid();
      const at = new Date().toISOString();
      for (const c of cards) {
        browseChange(d, actionId, 'forget', c, at, {
          phase: 'new',
          interday: false,
          remainingSteps: 0,
          due: null,
          interval: 0,
          stability: null,
          difficulty: null,
          lastReview: null,
          suspended: false,
          buriedUntil: null,
          ...(resetCounts ? { reps: 0, lapses: 0 } : {}),
        });
      }
      write(d);
    },
    async undo() {
      const d = read();
      // As review_undo: only what was written in the last 48 hours can be undone.
      const since = Date.now() - UNDO_MS;
      const last = d.log.findLast((l) => Date.parse(l.loggedAt ?? l.reviewedAt) >= since);
      if (!last) return null;
      const rows = d.log.filter((l) => l.actionId === last.actionId);
      for (const row of [...rows].reverse()) {
        const i = d.cards.findIndex((c) => same(c, row));
        if (row.before === null) {
          if (i >= 0) d.cards.splice(i, 1);
        } else if (i >= 0) {
          const now = d.cards[i]!;
          d.cards[i] = { ...row.before, deckId: now.deckId, retiredAt: now.retiredAt ?? null };
        } else d.cards.push(row.before);
      }
      const main = rows[0]!;
      write({ ...d, log: d.log.filter((l) => l.actionId !== last.actionId) });
      return {
        action: main.action,
        noteGuid: main.noteGuid,
        ord: main.ord,
        deckId: main.deckId,
        rating: main.rating,
      };
    },
    async homeCounts(deckIds, until, decay) {
      const refused = deckIds.length ? checkDecks(deckIds, decay) : null;
      if (refused) throw new Error(`No se pudo leer tu avance: ${refused}`);
      const wanted = new Set(deckIds);
      const nowMs = Date.now();
      const hidden = (c: StoredCard) =>
        c.suspended || (c.buriedUntil !== null && Date.parse(c.buriedUntil) > nowMs);
      const out = new Map<string, HomeDeckCounts & { notes: Set<string> }>();
      for (const c of read().cards) {
        if (!wanted.has(c.deckId) || c.retiredAt) continue;
        let deck = out.get(c.deckId);
        if (!deck) {
          deck = {
            deckId: c.deckId,
            seen: 0,
            hiddenNew: 0,
            touched: 0,
            suspended: 0,
            recall: 0,
            due: [],
            notes: new Set(),
          };
          out.set(c.deckId, deck);
        }
        deck.notes.add(c.noteGuid);
        if (c.suspended) deck.suspended++;
        if (c.phase === 'new') {
          if (hidden(c)) deck.hiddenNew++;
          continue;
        }
        deck.seen++;
        if (!c.suspended && c.stability !== null && c.lastReview !== null) {
          const days = Math.max(0, nowMs - Date.parse(c.lastReview)) / 86_400_000;
          deck.recall += retrievability(
            [...Array<number>(20).fill(0), decay[c.deckId] ?? 0.5],
            { stability: c.stability, difficulty: c.difficulty ?? 5 },
            days,
          );
        }
        if (c.due === null || hidden(c) || (c.interday && Date.parse(c.due) >= until.getTime())) {
          continue;
        }
        deck.due.push({
          noteGuid: c.noteGuid,
          ord: c.ord,
          queue: c.phase === 'review' ? 'r' : c.interday ? 'd' : 'l',
          due: Math.floor(Date.parse(c.due) / 1000),
        });
      }
      // Past 20,000 cards due the database gives no decks, and the web reads the decks instead.
      const due = [...out.values()].reduce((t, deck) => t + deck.due.length, 0);
      if (due > MAX_HOME_DUE) return { truncated: true, decks: [] };
      return {
        truncated: false,
        decks: [...out.values()]
          // The decks are a map's keys: never two equal.
          .sort((a, b) => (a.deckId < b.deckId ? -1 : 1))
          .map(({ notes, ...d }) => ({
            ...d,
            touched: notes.size,
            due: d.due.sort((a, b) =>
              a.noteGuid < b.noteGuid ? -1 : a.noteGuid > b.noteGuid ? 1 : a.ord - b.ord,
            ),
          })),
      };
    },
    async cardsSyncedTo() {
      return read().syncedTo ?? 0;
    },
    async reconcileCards({ since, upTo, changes }) {
      if (changes.length > MAX_CHANGES) {
        throw new Error('No se pudo poner al día tus tarjetas: too_large');
      }
      const d = read();
      if ((d.syncedTo ?? 0) !== since) {
        return { applied: false, syncedTo: d.syncedTo ?? 0, changed: 0 };
      }
      let changed = 0;
      const now = new Date().toISOString();
      for (const c of changes) {
        const i = d.cards.findIndex((x) => same(x, c));
        if (i < 0) continue;
        const row = d.cards[i]!;
        const deckId = c.deckId ?? row.deckId;
        const retiredAt = c.deckId === null ? (row.retiredAt ?? now) : null;
        if (deckId === row.deckId && !!retiredAt === !!row.retiredAt) continue;
        d.cards[i] = { ...row, deckId, retiredAt };
        changed++;
      }
      write({ ...d, syncedTo: upTo });
      return { applied: true, syncedTo: upTo, changed };
    },
  };
}

const validFlag = (flag: number) => Number.isInteger(flag) && flag >= 0 && flag <= 7;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
