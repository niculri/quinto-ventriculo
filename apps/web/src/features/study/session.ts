// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import {
  answerCard,
  retrievability,
  describeNextStates,
  newCard,
  nextLearnMessage,
  schedulingStates,
} from '@qv/srs';
import type {
  DeckConfig,
  QueueEntry,
  QueueUpdate,
  Rating,
  SchedulingStates,
  StudyQueue,
} from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import { CardChangedError } from './repository';
import type {
  ActionName,
  AnswerToday,
  CardKey,
  CardRef,
  ReviewInput,
  StoredCard,
  StudyRepository,
} from './repository';
import {
  QUEUE_NAMES,
  buildQueue,
  cardKey,
  configsFor,
  isHidden,
  siblingsOf,
  subtree,
  siblingsToBury,
  timingFor,
  toRecord,
  toStateFields,
} from './scheduler';
import type { StudyData } from './scheduler';
import { assessmentView, rollProgress } from './pace';
import type { CatchUp } from './pace';
import { ASSESSMENT_DEPTH, ancestorName, decksGivingNew, extrasOff, isExtras } from './simple';

export const ACTION_LABELS: Record<ActionName, string> = {
  answer: 'Responder tarjeta',
  bury_card: 'Enterrar tarjeta',
  bury_note: 'Enterrar nota',
  suspend_card: 'Suspender tarjeta',
  suspend_note: 'Suspender nota',
  flag: 'Marcar tarjeta',
  unbury: 'Desenterrar',
  unsuspend: 'Quitar suspensión',
  forget: 'Olvidar',
};

/** The same actions as simple mode calls them. */
const SIMPLE_ACTION_LABELS: Partial<Record<ActionName, string>> = {
  bury_card: 'Saltar por hoy',
  bury_note: 'Saltar por hoy',
  suspend_card: 'No mostrar más',
  suspend_note: 'No mostrar más',
  flag: 'Marcar para revisar',
};

/** What an action is called for this user. */
export function actionLabel(action: ActionName, fullAnki: boolean): string {
  return (!fullAnki && SIMPLE_ACTION_LABELS[action]) || ACTION_LABELS[action];
}

export type HideAction = 'bury_card' | 'bury_note' | 'suspend_card' | 'suspend_note';

type HistoryItem =
  | {
      kind: 'answer';
      card: CardRef;
      /** Rows of the card and of the siblings it buried, before. */
      before: Map<string, StoredCard | undefined>;
      stamps: Map<string, string | null>;
      update: QueueUpdate;
      answer: AnswerToday;
    }
  | {
      kind: 'action';
      action: ActionName;
      card: CardRef;
      before: Map<string, StoredCard | undefined>;
      stamps: Map<string, string | null>;
    };

export interface Shown {
  entry: QueueEntry;
  states: SchedulingStates;
  /** The four buttons' intervals («<1 m», «10 m», «1 d», «4 d»). */
  labels: [string, string, string, string];
  /** When the front was shown (Anki times the answer from there). */
  shownAt: number;
}

export interface CongratsInfo {
  /** «La próxima tarjeta estará lista en…» (empty if none today). */
  learnMessage: string;
  reviewLimitReached: boolean;
  newLimitReached: boolean;
  buried: boolean;
  dueTomorrow: number;
  /** Simple mode: new cards of what is not turned on (Extras do not count). */
  inactiveNew: number;
  /** Simple mode: nothing of this deck is turned on. */
  nothingActive: boolean;
  /** Simple mode: this deck is an «Extras» and its assessment does not include them. */
  extrasOff: boolean;
  /** Simple mode: what the assessment mode has to say when the day is done (null above an assessment). */
  exam: ExamNotes | null;
}

export interface ExamNotes {
  /** The new cards of the day come from the date, not from a number the student can raise. */
  computed: boolean;
  /** No new cards: these are the days of the final review. */
  finalReview: boolean;
  /** Today was the last day with new cards: tomorrow the final review starts. */
  lastNewDay: boolean;
  /** «Para llegar a la fecha, ahora son 35 al día». */
  roseTo: number | null;
  /** A large backlog elsewhere in the assessment. */
  catchUp: CatchUp | null;
}

/** A row for a card the database has none of (a new card): what `card_states` defaults to. */
export function blankRow(ref: CardRef): StoredCard {
  return {
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
  };
}

/**
 * A study session of a deck (Anki's reviewer): the queue lives here; answers apply at once and are saved to
 * the database in order, in the background; undo goes back one action, also in the database. The page
 * subscribes to it (useSyncExternalStore) and calls its methods from its event handlers.
 */
/**
 * A card that is new: without a row, or forgotten in the browser (Anki keeps its repetitions and lapses
 * unless «Olvidar» reset them).
 */
function asNew(row: StoredCard | undefined) {
  return { ...newCard(0), reps: row?.reps ?? 0, lapses: row?.lapses ?? 0 };
}

export class StudySession {
  shown: Shown | null = null;
  revealed = false;
  toast: string | null = null;
  /** A save that failed: the session stops (the user reloads). */
  failure: string | null = null;
  /** When the queue was last looked at (the congratulations screen counts from it). */
  now = Date.now();

  private data: StudyData;
  private queue: StudyQueue;
  private configs: Map<string, DeckConfig>;
  private history: HistoryItem[] = [];
  /** Each card's `updatedAt` in the database (what the next answer sends to detect a conflict). */
  private stamps: Map<string, string | null>;
  private chain: Promise<unknown> = Promise.resolve();
  /** Writes not yet saved (the page asks before leaving while there are some). */
  pending = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initial: StudyData,
    private readonly rootId: string,
    private readonly repository: StudyRepository,
    private readonly prefetch: (entries: QueueEntry[]) => void = () => {},
    /** Waits before trying an answer again when the connection failed (twice: after 1 s and 3 s). */
    private readonly retryDelaysMs: readonly number[] = [1000, 3000],
  ) {
    this.data = { ...initial, rows: new Map(initial.rows), answers: [...initial.answers] };
    this.configs = configsFor(this.data);
    this.queue = buildQueue(this.data, rootId);
    this.stamps = new Map([...initial.rows].map(([k, r]) => [k, r.updatedAt]));
  }

  get deck(): DeckDetail {
    return this.data.deck;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  counts() {
    return this.queue.counts();
  }

  /** The row of a card as the session has it now. */
  row(key: { noteGuid: string; ord: number }): StoredCard | undefined {
    return this.data.rows.get(cardKey(key));
  }

  /** Waits until everything is saved. */
  saved(): Promise<unknown> {
    return this.chain;
  }

  private setToast(text: string) {
    this.toast = text;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.changed();
    }, 3000);
  }

  private rebuild() {
    this.configs = configsFor(this.data);
    this.queue = buildQueue(this.data, this.rootId);
  }

  /** Shows the next card of the queue (its front), with its four next states computed now. */
  showNext() {
    const now = Date.now();
    this.now = now;
    const timing = timingFor(this.data.prefs, now);
    if (timing.today !== this.queue.today) {
      // A new day: yesterday's answers no longer count against the limits; buried cards come back.
      if (this.data.progress) {
        this.data.progress = rollProgress(this.data.progress, this.data.answers);
      }
      this.data.answers = [];
      this.rebuild();
    }
    this.queue.updateCutoff(timing.now);
    const entry = this.queue.next();
    this.revealed = false;
    if (!entry) {
      this.shown = null;
      this.changed();
      return;
    }
    const record = toRecord(this.row(entry), this.data.prefs) ?? asNew(this.row(entry));
    const states = schedulingStates(entry, record, this.configs.get(entry.deckId)!, timing);
    const labels = describeNextStates(
      states,
      timing.nextDayAt - timing.now,
      this.queue.learnAheadSecs,
    );
    this.shown = { entry, states, labels, shownAt: now };
    // The next cards are fetched ahead, so there is no wait between cards.
    this.prefetch(this.queue.upcoming(4).slice(1));
    this.changed();
  }

  /**
   * The card on screen is no longer on the site (the author took it out after the session opened, and the API
   * answers 404): it leaves this session and the next one comes. Nothing is written: its progress stays as it
   * was, and if the card comes back it goes on from there.
   */
  skipMissing(card: CardKey) {
    const entry = this.shown?.entry;
    if (!entry || entry.noteGuid !== card.noteGuid || entry.ord !== card.ord) return;
    const deck = this.data.deck;
    this.data.deck = {
      ...deck,
      cards: deck.cards.filter((c) => c.noteGuid !== card.noteGuid || c.ord !== card.ord),
    };
    this.rebuild();
    this.showNext();
  }

  /** While there is nothing to show: a learning card may have come due. */
  tick() {
    if (this.shown) return;
    this.showNext();
  }

  reveal() {
    if (!this.shown || this.revealed) return;
    this.revealed = true;
    this.changed();
  }

  /**
   * Saves to the database in order; a failure stops the session with a message, and what was waiting behind
   * it is not written (it was computed on top of what failed: after reloading, those cards come back as the
   * database has them).
   */
  private enqueue(write: () => Promise<unknown>) {
    this.pending++;
    this.chain = this.chain
      .then(() => (this.failure ? undefined : write()))
      .catch((e: unknown) => {
        this.failure =
          e instanceof CardChangedError
            ? 'Esta tarjeta cambió en otra pestaña o dispositivo. Vuelve a cargar para seguir estudiando.'
            : e instanceof Error && e.message.startsWith('No se pudo')
              ? e.message
              : 'No se pudo guardar tu avance. Revisa tu conexión y vuelve a cargar.';
        this.changed();
      })
      .finally(() => {
        this.pending--;
      });
  }

  /**
   * Saves an answer. A failed connection is tried again (a phone that loses the signal for a moment); a
   * retry cannot save it twice, because the database only takes it if the card is still as it was shown. If
   * the first try did save it and only the reply was lost, the retry finds the card changed by this very
   * answer, and that counts as saved.
   */
  private async saveAnswer(input: ReviewInput, key: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await this.repository.recordReview(input);
        this.stamps.set(key, saved.updatedAt);
        return;
      } catch (e) {
        if (attempt > 0 && e instanceof CardChangedError) {
          const rows = await this.repository.cards([input.card.deckId]);
          const row = rows.find((r) => cardKey(r) === key);
          if (row && row.lastReview === input.state.lastReview && row.reps === input.state.reps) {
            this.stamps.set(key, row.updatedAt);
            return;
          }
        }
        const delay = this.retryDelaysMs[attempt];
        if (e instanceof CardChangedError || delay === undefined) throw e;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private snapshot(refs: CardRef[]) {
    const before = new Map<string, StoredCard | undefined>();
    const stamps = new Map<string, string | null>();
    for (const r of refs) {
      before.set(cardKey(r), this.data.rows.get(cardKey(r)));
      stamps.set(cardKey(r), this.stamps.get(cardKey(r)) ?? null);
    }
    return { before, stamps };
  }

  private restore(item: {
    before: Map<string, StoredCard | undefined>;
    stamps: Map<string, string | null>;
  }) {
    for (const [k, row] of item.before) {
      if (row) this.data.rows.set(k, row);
      else this.data.rows.delete(k);
    }
    for (const [k, stamp] of item.stamps) this.stamps.set(k, stamp);
  }

  private currentRef(): CardRef | null {
    if (!this.shown) return null;
    const { noteGuid, ord, deckId } = this.shown.entry;
    return { noteGuid, ord, deckId };
  }

  answer(rating: Rating) {
    const ref = this.currentRef();
    if (!ref || !this.revealed || this.failure) return;
    const { states, shownAt } = this.shown!;
    const key = cardKey(ref);
    const now = Date.now();
    const timing = timingFor(this.data.prefs, now);
    const config = this.configs.get(ref.deckId)!;
    const prev = this.data.rows.get(key);
    const record = toRecord(prev, this.data.prefs) ?? asNew(prev);
    // FSRS's predicted recall just before the answer, saved for calibrating it later (null for a new card).
    const rBefore =
      record.stability !== null && record.difficulty !== null && record.lastReview !== null
        ? retrievability(
            config.fsrsParams,
            { stability: record.stability, difficulty: record.difficulty },
            Math.max(0, now / 1000 - record.lastReview) / 86_400,
          )
        : null;
    const cardVersion =
      this.data.deck.cards.find((c) => c.noteGuid === ref.noteGuid && c.ord === ref.ord)?.version ??
      null;
    const result = answerCard(ref, record, rating, config, timing, {}, states);
    const bury = siblingsToBury(this.data, ref, record.queue, config, now);
    const buriedUntil = new Date(timing.nextDayAt * 1000).toISOString();
    const { before, stamps } = this.snapshot([ref, ...bury]);

    const fields = toStateFields(result.card, this.data.prefs, {
      suspended: (prev?.suspended ?? false) || result.suspend,
      leech: (prev?.leech ?? false) || result.leech,
    });
    this.data.rows.set(key, { ...(prev ?? blankRow(ref)), ...fields, deckId: ref.deckId });
    for (const b of bury) {
      const row = this.data.rows.get(cardKey(b)) ?? blankRow(b);
      this.data.rows.set(cardKey(b), { ...row, buriedUntil });
    }
    const answered: AnswerToday = { deckId: ref.deckId, queueBefore: QUEUE_NAMES[record.queue] };
    this.data.answers.push(answered);
    // A card the answer suspends (a leech) does not come back today.
    const update = this.queue.answered(
      ref,
      result.suspend ? { ...result.card, queue: 'review' } : result.card,
      timing,
    );
    this.history.push({ kind: 'answer', card: ref, before, stamps, update, answer: answered });

    // Anki caps the time on a card to the preset's maximum.
    const durationMs = Math.round(Math.min(now - shownAt, config.capAnswerTimeToSecs * 1000));
    this.enqueue(async () => {
      await this.saveAnswer(
        {
          card: ref,
          expectedUpdatedAt: this.stamps.get(key) ?? null,
          rating,
          queueBefore: answered.queueBefore,
          interval: result.log.interval,
          lastInterval: result.log.lastInterval,
          durationMs,
          rBefore:
            rBefore !== null && Number.isFinite(rBefore) ? Math.round(rBefore * 1e4) / 1e4 : null,
          cardVersion,
          state: fields,
          bury,
          buriedUntil: bury.length ? buriedUntil : null,
        },
        key,
      );
      // The siblings it buried changed in the database: their new times are read back.
      if (bury.length) await this.refreshStamps(bury.map((b) => b.deckId));
    });
    // In simple mode a leech is only noted down: nothing is suspended by itself, and nothing to explain.
    if (result.leech && this.data.prefs.fullAnki) {
      this.setToast(
        result.suspend
          ? 'La tarjeta era una sanguijuela. Ha sido suspendida.'
          : 'La tarjeta era una sanguijuela.',
      );
    }
    this.showNext();
  }

  private async refreshStamps(deckIds: string[]) {
    const fresh = await this.repository.cards([...new Set(deckIds)]);
    for (const r of fresh) this.stamps.set(cardKey(r), r.updatedAt);
  }

  /** Bury or suspend (the card or its whole note): the queue is rebuilt without them, as in Anki. */
  hide(action: HideAction) {
    const ref = this.currentRef();
    if (!ref || this.failure) return;
    const note = action.endsWith('note');
    const bury = action.startsWith('bury');
    const cards = note ? [ref, ...siblingsOf(this.data.deck, ref)] : [ref];
    // Anki does not bury a suspended card.
    const targets = bury ? cards.filter((c) => !this.row(c)?.suspended) : cards;
    const until = new Date(timingFor(this.data.prefs).nextDayAt * 1000);
    const { before, stamps } = this.snapshot(targets);
    for (const c of targets) {
      const row = this.row(c) ?? blankRow(c);
      this.data.rows.set(
        cardKey(c),
        bury
          ? { ...row, buriedUntil: until.toISOString() }
          : { ...row, suspended: true, buriedUntil: null },
      );
    }
    this.history.push({ kind: 'action', action, card: ref, before, stamps });
    this.enqueue(async () => {
      if (bury) await this.repository.bury(targets, until, note);
      else await this.repository.suspend(targets, note);
      await this.refreshStamps(targets.map((t) => t.deckId));
    });
    this.setToast(
      this.data.prefs.fullAnki
        ? {
            bury_card: 'Tarjeta enterrada.',
            bury_note: 'Nota enterrada.',
            suspend_card: 'Tarjeta suspendida.',
            suspend_note: 'La nota se ha suspendido.',
          }[action]
        : bury
          ? 'Saltada por hoy.'
          : 'Esta tarjeta no se mostrará más.',
    );
    this.rebuild();
    this.showNext();
  }

  /** The flag (1–7); the same flag again takes it off, as in Anki. */
  flag(value: number) {
    const ref = this.currentRef();
    if (!ref || this.failure) return;
    const row = this.row(ref) ?? blankRow(ref);
    const next = row.flag === value ? 0 : value;
    const { before, stamps } = this.snapshot([ref]);
    this.data.rows.set(cardKey(ref), { ...row, flag: next });
    this.history.push({ kind: 'action', action: 'flag', card: ref, before, stamps });
    this.enqueue(async () => {
      await this.repository.setFlag(ref, next);
      await this.refreshStamps([ref.deckId]);
    });
    this.changed();
  }

  /** There is something to undo: only what was done since this study session started. */
  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Undoes the last action of this study session; what was done before it stays as it is. */
  undo() {
    if (this.failure) return;
    const item = this.history.pop();
    if (item) {
      this.restore(item);
      if (item.kind === 'answer') {
        this.queue.undo(item.update);
        const i = this.data.answers.lastIndexOf(item.answer);
        if (i >= 0) this.data.answers.splice(i, 1);
      } else if (item.action !== 'flag') {
        this.rebuild();
        this.queue.moveToFront(item.card);
      }
      const action = item.kind === 'answer' ? 'answer' : item.action;
      this.enqueue(async () => {
        const undone = await this.repository.undo();
        // The database undoes the user's last action: if it was not this one (another tab or device did
        // something after it), what is shown here is no longer what is saved.
        if (
          undone?.action !== action ||
          undone.noteGuid !== item.card.noteGuid ||
          undone.ord !== item.card.ord
        ) {
          throw new CardChangedError();
        }
      });
      this.setToast(`Deshecho: ${actionLabel(action, this.data.prefs.fullAnki)}`);
      if (item.kind === 'action' && item.action === 'flag') this.changed();
      else this.showNext();
      return;
    }
    this.setToast('No hay nada que deshacer');
    this.changed();
  }

  /** What the congratulations screen says (congrats.rs). */
  congrats(): CongratsInfo {
    const timing = timingFor(this.data.prefs, this.now);
    const decks = subtree(this.data.decks, this.rootId);
    const active = new Set(decks.map((d) => d.id));
    const extras = new Set(decks.filter((d) => isExtras(d.name)).map((d) => d.id));
    const givingNew = decksGivingNew(this.data.decks, this.data.plan);
    let learnCount = 0;
    let nextLearn: number | null = null;
    const info = {
      reviewLimitReached: false,
      newLimitReached: false,
      buried: false,
      dueTomorrow: 0,
      inactiveNew: 0,
    };
    let anyActive = false;
    for (const c of this.data.deck.cards) {
      if (!active.has(c.deckId)) continue;
      if (givingNew.has(c.deckId) && !extras.has(c.deckId)) anyActive = true;
      const row = this.row(c);
      if (row?.suspended) continue;
      if (isHidden(row, this.now)) {
        info.buried = true;
        continue;
      }
      const record = toRecord(row, this.data.prefs);
      if (!record) {
        if (!givingNew || givingNew.has(c.deckId)) info.newLimitReached = true;
        else if (!extras.has(c.deckId)) info.inactiveNew++;
      } else if (record.queue === 'learn') {
        learnCount++;
        nextLearn = nextLearn === null ? record.due : Math.min(nextLearn, record.due);
      } else if (record.due <= timing.today) info.reviewLimitReached = true;
      else if (record.due === timing.today + 1) info.dueTomorrow++;
    }
    // Anki: the next learning card, counted to when it enters the learn-ahead limit (at least a minute).
    const secs =
      nextLearn === null
        ? 86_400
        : Math.max(60, nextLearn - this.queue.learnAheadSecs - timing.now);
    return {
      ...info,
      nothingActive: !anyActive,
      extrasOff: !!givingNew && extrasOff(this.data.decks, this.data.plan, this.rootId),
      learnMessage: nextLearnMessage(secs, learnCount),
      exam: givingNew ? this.examNotes(timing.today) : null,
    };
  }

  /**
   * The assessment this session is in, for the screen at the end. What was due in the decks of this session is gone by
   * then; what was due in the others of the assessment is as it was when the session opened.
   */
  private examNotes(today: number): ExamNotes | null {
    const root = this.data.decks.find((d) => d.id === this.rootId);
    const name = root ? ancestorName(root.name, ASSESSMENT_DEPTH) : null;
    const assessmentId = this.data.decks.find((d) => d.name === name)?.id;
    if (!assessmentId) return null;
    const here = new Set(subtree(this.data.decks, this.rootId).map((d) => d.id));
    const view = assessmentView({
      decks: this.data.decks,
      plan: this.data.plan,
      progress: (this.data.progress ?? []).map((p) =>
        here.has(p.deckId) ? { ...p, overdue: 0 } : p,
      ),
      assessmentId,
      today,
      prefs: this.data.prefs,
    });
    return {
      computed: view.pace.kind === 'computed',
      finalReview: view.pace.kind === 'final-review',
      lastNewDay: view.lastNewDay,
      roseTo: view.rose ? view.pace.newPerDay : null,
      catchUp: view.catchUp,
    };
  }

  /** Cards already seen in an assessment: its final review has something to show. */
  hasSeen(assessmentId: string): boolean {
    const root = this.data.decks.find((d) => d.id === assessmentId);
    if (!root) return false;
    const inside = new Set(subtree(this.data.decks, assessmentId).map((d) => d.id));
    return (
      (this.data.progress ?? []).some((p) => inside.has(p.deckId) && p.seen > 0) ||
      this.data.answers.some((a) => inside.has(a.deckId))
    );
  }
}
