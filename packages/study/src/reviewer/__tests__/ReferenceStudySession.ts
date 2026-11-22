// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// A study session of a deck (Anki's reviewer): the queue, answers applied at once and saved in order in the
// background, and undo back to the start of the session; the page subscribes with useSyncExternalStore.
import { answerCard, retrievability, describeNextStates, schedulingStates } from '@qv/srs';
import type { DeckConfig, QueueEntry, Rating } from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import type { AnswerToday, CardRef, StoredCard } from '@qv/schema/user';
import { congratsInfo, answeredTodayIn, hasSeenAssessment } from '../../congrats';
import { rollProgress } from '../../rollProgress';
import {
  QUEUE_NAMES,
  cardKey,
  configsFor,
  queueInput,
  siblingsOf,
  siblingsToBury,
  timingFor,
  toRecord,
  toStateFields,
} from '../../scheduler';
import type { StudyData } from '../../scheduler';
import { actionLabel, asNew, blankRow } from '../../session';
import { ReferenceQueue } from './ReferenceQueue';
import type { CongratsInfo, HideAction, Shown } from '../../session';
import {
  CardChangedError,
  refreshStamps,
  saveAnswer,
  SaveQueue,
  studyStrings,
} from './referenceSave';
import type { SessionRepository } from './referenceSave';
import { keepStamps, restore, restoreStamps, snapshot } from './referenceHistory';
import type { HistoryItem } from './referenceHistory';

type CardKey = { noteGuid: string; ord: number };

const queueOf = (data: StudyData, rootId: string) => new ReferenceQueue(queueInput(data, rootId));

export class ReferenceStudySession {
  shown: Shown | null = null;
  revealed = false;
  toast: string | null = null;
  now = Date.now();

  data: StudyData;
  queue: ReferenceQueue;
  private configs: Map<string, DeckConfig>;
  history: HistoryItem[] = [];
  stamps: Map<string, string | null>;
  private saves = new SaveQueue(() => this.changed());
  private listeners = new Set<() => void>();
  private version = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initial: StudyData,
    private readonly rootId: string,
    private readonly repository: SessionRepository,
    private readonly prefetch: (entries: QueueEntry[]) => void = () => undefined,
    private readonly retryDelaysMs: readonly number[] = [1000, 3000],
  ) {
    this.data = { ...initial, rows: new Map(initial.rows), answers: [...initial.answers] };
    this.configs = configsFor(this.data);
    this.queue = queueOf(this.data, rootId);
    this.stamps = new Map([...initial.rows].map(([k, r]) => [k, r.updatedAt]));
  }

  get deck(): DeckDetail {
    return this.data.deck;
  }

  get failure(): string | null {
    return this.saves.failure;
  }

  get pending(): number {
    return this.saves.pending;
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

  row(key: { noteGuid: string; ord: number }): StoredCard | undefined {
    return this.data.rows.get(cardKey(key));
  }

  saved(): Promise<unknown> {
    return this.saves.saved();
  }

  private setToast(text: string) {
    this.toast = text;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.changed();
    }, 3000);
  }

  // A new day: yesterday's answers no longer count against the limits (`carried`, an answer given just now, is
  // today's) and buried cards come back. Whatever rebuilds the queue goes through here first.
  private rebuild(carried?: AnswerToday) {
    if (timingFor(this.data.prefs).today !== this.queue.today) {
      if (this.data.progress) {
        this.data.progress = rollProgress(this.data.progress, this.data.answers);
      }
      this.data.answers = carried ? [carried] : [];
    }
    this.configs = configsFor(this.data);
    this.queue = queueOf(this.data, this.rootId);
  }

  showNext(carried?: AnswerToday) {
    const now = Date.now();
    this.now = now;
    const timing = timingFor(this.data.prefs, now);
    if (timing.today !== this.queue.today) {
      this.rebuild(carried);
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
    this.prefetch(this.queue.upcoming(4).slice(1));
    this.changed();
  }

  // Nothing is written: if the card comes back to the site, its progress goes on from where it was.
  skipMissing(card: CardKey) {
    const entry = this.shown?.entry;
    if (entry?.noteGuid !== card.noteGuid || entry.ord !== card.ord) return;
    const deck = this.data.deck;
    this.data.deck = {
      ...deck,
      cards: deck.cards.filter((c) => c.noteGuid !== card.noteGuid || c.ord !== card.ord),
    };
    this.rebuild();
    this.showNext();
  }

  tick() {
    if (this.shown) return;
    this.showNext();
  }

  reveal() {
    if (!this.shown || this.revealed) return;
    this.revealed = true;
    this.changed();
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
    const kept = snapshot(this.data.rows, [ref, ...bury]);

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
    // The first answer after the day turned over is today's: `showNext` adds it once it has rolled the day.
    const newDay = timing.today !== this.queue.today;
    if (!newDay) this.data.answers.push(answered);
    // A card the answer suspends (a leech) does not come back today.
    const update = this.queue.answered(
      ref,
      result.suspend ? { ...result.card, queue: 'review' } : result.card,
      timing,
    );
    this.history.push({ kind: 'answer', card: ref, ...kept, update, answer: answered });
    this.answeredInSession++;

    // Anki caps the time on a card to the preset's maximum.
    const durationMs = Math.round(Math.min(now - shownAt, config.capAnswerTimeToSecs * 1000));
    this.saves.enqueue(async () => {
      keepStamps(kept, this.stamps);
      await saveAnswer(
        this.repository,
        this.stamps,
        this.retryDelaysMs,
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
      if (bury.length)
        await refreshStamps(
          this.repository,
          this.stamps,
          bury.map((b) => b.deckId),
        );
    });
    // In simple mode a leech is only noted down: nothing is suspended by itself, and nothing to explain.
    if (result.leech && this.data.prefs.fullAnki) {
      this.setToast(
        result.suspend ? studyStrings.session.leechSuspended : studyStrings.session.leech,
      );
    }
    this.showNext(newDay ? answered : undefined);
  }

  hide(action: HideAction) {
    const ref = this.currentRef();
    if (!ref || this.failure) return;
    const note = action.endsWith('note');
    const bury = action.startsWith('bury');
    const cards = note ? [ref, ...siblingsOf(this.data.deck, ref)] : [ref];
    // Anki does not bury a suspended card.
    const targets = bury ? cards.filter((c) => !this.row(c)?.suspended) : cards;
    const until = new Date(timingFor(this.data.prefs).nextDayAt * 1000);
    const kept = snapshot(this.data.rows, targets);
    for (const c of targets) {
      const row = this.row(c) ?? blankRow(c);
      this.data.rows.set(
        cardKey(c),
        bury
          ? { ...row, buriedUntil: until.toISOString() }
          : { ...row, suspended: true, buriedUntil: null },
      );
    }
    this.history.push({ kind: 'action', action, card: ref, ...kept });
    this.saves.enqueue(async () => {
      keepStamps(kept, this.stamps);
      if (bury) await this.repository.bury(targets, until, note);
      else await this.repository.suspend(targets, note);
      await refreshStamps(
        this.repository,
        this.stamps,
        targets.map((t) => t.deckId),
      );
    });
    this.setToast(
      this.data.prefs.fullAnki
        ? studyStrings.session.hidden[action]
        : bury
          ? studyStrings.session.skipped
          : studyStrings.session.neverAgain,
    );
    this.rebuild();
    this.showNext();
  }

  flag(value: number) {
    const ref = this.currentRef();
    if (!ref || this.failure) return;
    const row = this.row(ref) ?? blankRow(ref);
    const next = row.flag === value ? 0 : value;
    const kept = snapshot(this.data.rows, [ref]);
    this.data.rows.set(cardKey(ref), { ...row, flag: next });
    this.history.push({ kind: 'action', action: 'flag', card: ref, ...kept });
    this.saves.enqueue(async () => {
      keepStamps(kept, this.stamps);
      await this.repository.setFlag(ref, next);
      await refreshStamps(this.repository, this.stamps, [ref.deckId]);
    });
    this.changed();
  }

  answeredInSession = 0;

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  undo() {
    if (this.failure) return;
    const item = this.history.pop();
    if (item) {
      restore(this.data.rows, item);
      if (item.kind === 'answer') {
        this.queue.undo(item.update);
        const i = this.data.answers.lastIndexOf(item.answer);
        if (i >= 0) this.data.answers.splice(i, 1);
      } else if (item.action !== 'flag') {
        this.rebuild();
        this.queue.moveToFront(item.card);
      }
      const action = item.kind === 'answer' ? 'answer' : item.action;
      this.saves.enqueue(async () => {
        const undone = await this.repository.undo();
        restoreStamps(this.stamps, item);
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
      this.setToast(studyStrings.session.undone(actionLabel(action, this.data.prefs.fullAnki)));
      if (item.kind === 'action' && item.action === 'flag') this.changed();
      else this.showNext();
      return;
    }
    this.setToast(studyStrings.session.nothingToUndo);
    this.changed();
  }

  /** What the congratulations screen says (congrats.rs). */
  congrats(): CongratsInfo {
    return congratsInfo(this.data, this.rootId, this.now, this.queue.learnAheadSecs);
  }

  answeredToday(deckIds: ReadonlySet<string>): boolean {
    return answeredTodayIn(this.data, deckIds);
  }

  hasSeen(assessmentId: string): boolean {
    return hasSeenAssessment(this.data, assessmentId);
  }
}
