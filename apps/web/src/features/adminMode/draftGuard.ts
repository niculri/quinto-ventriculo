// The net under the admin mode: what only the draft has is never written to the user's database (the screens already do
// not offer it; this holds when one does). It is answered as done, so a queue with a draft card in it goes on.
import type { QuizRepository } from '../quiz/api/repository';
import type { StudyRepository } from '../progress/api/repository';
import type { CardRef } from '../progress/api/repository';
import type { NewReport, ReportsRepository } from '../reports/api/repository';
import { REPORT_MESSAGES, ReportError } from '../reports/api/repository';
import type { DraftOnly } from './draftOnly';

async function keepReal<T extends CardRef>(draft: DraftOnly, cards: readonly T[]): Promise<T[]> {
  const flags = await Promise.all(cards.map((c) => draft.card(c)));
  return cards.filter((_, i) => !flags[i]);
}

export function guardStudy(real: StudyRepository, draft: DraftOnly): StudyRepository {
  const cardsWrite =
    <A extends unknown[]>(
      write: (cards: CardRef[], ...rest: A) => Promise<void>,
    ): ((cards: CardRef[], ...rest: A) => Promise<void>) =>
    async (cards, ...rest) => {
      const kept = await keepReal(draft, cards);
      if (kept.length) await write(kept, ...rest);
    };
  const cardWrite =
    <A extends unknown[]>(
      write: (card: CardRef, ...rest: A) => Promise<void>,
    ): ((card: CardRef, ...rest: A) => Promise<void>) =>
    async (card, ...rest) => {
      if (!(await draft.card(card))) await write(card, ...rest);
    };
  return {
    ...real,
    recordReview: async (input) =>
      (await draft.card(input.card))
        ? { updatedAt: input.expectedUpdatedAt ?? new Date().toISOString() }
        : real.recordReview(input),
    bury: (cards, until, note) => cardsWrite((c) => real.bury(c, until, note))(cards),
    suspend: (cards, note) => cardsWrite((c) => real.suspend(c, note))(cards),
    unsuspend: (cards) => cardsWrite((c) => real.unsuspend(c))(cards),
    unbury: (cards) => cardsWrite((c) => real.unbury(c))(cards),
    setFlags: (cards, flag) => cardsWrite((c) => real.setFlags(c, flag))(cards),
    forget: (cards, reset) => cardsWrite((c) => real.forget(c, reset))(cards),
    setFlag: (card, flag) => cardWrite((c) => real.setFlag(c, flag))(card),
    setDeckActivation: async (deckId, active) => {
      if (!(await draft.is('deck', deckId))) await real.setDeckActivation(deckId, active);
    },
    setDeckPreset: async (deckId, choice) => {
      if (!(await draft.is('deck', deckId))) await real.setDeckPreset(deckId, choice);
    },
    saveAssessmentSetting: async (setting) => {
      if (!(await draft.is('deck', setting.deckId))) {
        await real.saveAssessmentSetting(setting);
      }
    },
    recordPractice: async (counts) => {
      const flags = await Promise.all(counts.map((c) => draft.is('deck', c.deckId)));
      const kept = counts.filter((_, i) => !flags[i]);
      if (kept.length) await real.recordPractice(kept);
    },
  };
}

export function guardQuiz(real: QuizRepository, draft: DraftOnly): QuizRepository {
  return {
    ...real,
    save: async (step) => {
      if (!(await draft.is('quiz', step.quizId))) await real.save(step);
    },
  };
}

const quizOf = (id: string) => id.split('/')[0] ?? id;

async function isDraftReport(draft: DraftOnly, r: NewReport): Promise<boolean> {
  switch (r.kind) {
    case 'note':
      return draft.is('note', r.id);
    case 'quiz_question':
      return draft.is('quiz', quizOf(r.id));
    case 'card': {
      const at = r.id.lastIndexOf(':');
      return draft.card({ noteGuid: r.id.slice(0, at), ord: Number(r.id.slice(at + 1)) });
    }
  }
}

/** A report of what only the draft has is refused with a reason: nobody would read it against what a student has. */
export function guardReports(real: ReportsRepository, draft: DraftOnly): ReportsRepository {
  return {
    ...real,
    send: async (report) => {
      if (await isDraftReport(draft, report)) throw new ReportError(REPORT_MESSAGES.draftOnly);
      await real.send(report);
    },
  };
}
