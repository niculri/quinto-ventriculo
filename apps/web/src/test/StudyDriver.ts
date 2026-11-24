// A study session without a screen: the reducer and the save queue, driven like the study hook does, for the tests
// that walk a whole session.
import type { QueueEntry } from '@qv/srs';
import type { Rating } from '@qv/srs';
import {
  answeredToday,
  canUndo,
  commandsNotIn,
  congrats,
  countsOf,
  createStudyState,
  hasSeen,
  rowOf,
  studyReducer,
} from '@qv/study';
import type { CommandId, HideAction, StudyAction, StudyData, StudyState } from '@qv/study';
import { SaveQueue } from '../features/study/api/SaveQueue';
import { failureText, toastText } from '../features/study/model/messages';
import type { StudyRepository } from '../features/progress/api/repository';

export class StudyDriver {
  state: StudyState;
  private readonly saves: SaveQueue;
  private readonly taken = new Set<CommandId>();

  constructor(
    initial: StudyData,
    rootId: string,
    repository: StudyRepository,
    prefetch: (entries: readonly QueueEntry[]) => void = () => undefined,
    retryDelaysMs: readonly number[] = [1000, 3000],
  ) {
    this.state = createStudyState(initial, rootId, Date.now());
    this.saves = new SaveQueue(
      repository,
      new Map([...initial.rows].map(([k, r]) => [k, r.updatedAt])),
      retryDelaysMs,
      (failure) => this.dispatch({ type: 'saveFailed', failure }),
      prefetch,
      () => this.dispatch({ type: 'undoRefused' }),
    );
  }

  dispatch(action: StudyAction) {
    this.state = studyReducer(this.state, action);
    for (const command of commandsNotIn(this.state, this.taken)) {
      this.saves.handle(command);
      this.taken.add(command.id);
    }
  }

  get shown() {
    return this.state.shown;
  }
  get revealed() {
    return this.state.revealed;
  }
  get canUndo() {
    return canUndo(this.state);
  }
  get answeredInSession() {
    return this.state.answeredInSession;
  }
  get pending() {
    return this.saves.pending;
  }
  get toast(): string | null {
    const { toast, data } = this.state;
    return toast ? toastText(toast, data.prefs.fullAnki) : null;
  }
  get failure(): string | null {
    return this.state.failure ? failureText(this.state.failure) : null;
  }

  counts() {
    return countsOf(this.state);
  }
  row(card: { noteGuid: string; ord: number }) {
    return rowOf(this.state, card);
  }
  congrats() {
    return congrats(this.state);
  }
  answeredToday(deckIds: ReadonlySet<string>) {
    return answeredToday(this.state, deckIds);
  }
  hasSeen(assessmentId: string) {
    return hasSeen(this.state, assessmentId);
  }
  get unsaved() {
    return this.saves.unsaved;
  }
  saved() {
    return this.saves.saved();
  }
  retryNow() {
    this.saves.retryNow();
  }

  showNext() {
    this.dispatch({ type: 'showNext', now: Date.now() });
  }
  reveal() {
    this.dispatch({ type: 'reveal' });
  }
  answer(rating: Rating) {
    this.dispatch({ type: 'answer', rating, now: Date.now() });
  }
  hide(action: HideAction) {
    this.dispatch({ type: 'hide', action, now: Date.now() });
  }
  flag(value: number) {
    this.dispatch({ type: 'flag', value });
  }
  undo() {
    this.dispatch({ type: 'undo', now: Date.now() });
  }
}
