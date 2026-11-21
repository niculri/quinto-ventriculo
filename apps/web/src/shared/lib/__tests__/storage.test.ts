// The storage keys are what browsers already hold: each one keeps its exact value.
import { describe, expect, it } from 'vitest';
import { storageKeys } from '../storage';

describe('storage keys', () => {
  it('keep the names browsers already have', () => {
    expect(storageKeys).toMatchObject({
      theme: 'qv-theme',
      signInNext: 'qv-next',
      adminMode: 'qv-admin-mode',
      lastNote: 'qv-last-note',
      tipThisVisit: 'qv-tip',
      tipsShown: 'qv-tips-shown',
      browserView: 'qv-browse',
      cardsHideAnswers: 'qv-cards-hide-answers',
      collapsedDecks: 'qv-anki-collapsed',
      homeHeight: 'qv-home-height',
      demo: {
        prefix: 'qv-demo-',
        session: 'qv-demo-session',
        role: 'qv-demo-role',
        study: 'qv-demo-study',
        quiz: 'qv-demo-quiz',
        account: 'qv-demo-account',
        access: 'qv-demo-access',
        contentReports: 'qv-demo-content-reports',
        cards: 'qv-demo-cards',
        heatmap: 'qv-demo-heatmap',
      },
    });
  });
  it('a test’s tab and a date hint carry their id', () => {
    expect(storageKeys.quizTab('q1')).toBe('qv-quiz-tab:q1');
    expect(storageKeys.examDateHint('n1')).toBe('qv-exam-date:n1');
  });
});
