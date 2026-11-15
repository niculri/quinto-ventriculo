// The state of an assessment's options: the number typed and the date being written (each goes back to what is saved
// when that changes), saving them, and whether the date's choices show while the plan loads.

import { useEffect, useId, useState } from 'react';
import { dayOfDate, DEFAULT_NEW_PER_DAY, includesExtras, isExtras } from '@qv/study';
import type { AssessmentView, StudyPlan } from '@qv/study';
import { roughToday, useSaveAssessmentSetting } from '../../progress/hooks/useStudy';
import type { AssessmentSetting } from '../../progress/api/repository';
import { descendants } from '../../catalog/model/tree';
import type { DeckNode } from '../../catalog/model/tree';
import { storageKeys } from '../../../shared/lib/storage';
import { MAX_NEW_PER_DAY, paceOf } from '../model/assessmentOptions';

export function useAssessmentOptions(
  node: DeckNode,
  plan: StudyPlan | undefined,
  view: AssessmentView | null,
) {
  const numberId = useId();
  const dateId = useId();
  const save = useSaveAssessmentSetting();
  const stored = plan?.assessments.find((a) => a.deckId === node.id);
  const base: AssessmentSetting = stored ?? {
    deckId: node.id,
    includeExtras: false,
    newPerDay: null,
  };
  const value = stored?.newPerDay ?? DEFAULT_NEW_PER_DAY;
  const extras = plan ? includesExtras(plan, node.id) : false;
  const hasExtras = descendants(node).some((n) => isExtras(n.name));
  const date = stored?.examDate ?? '';

  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const [dateText, setDateText] = useState(date);
  const [shownDate, setShownDate] = useState(date);
  if (shownDate !== date) {
    setShownDate(date);
    setDateText(date);
  }

  const commit = () => {
    const n = Number(text);
    const next = Number.isFinite(n) && text.trim() ? Math.round(n) : value;
    const fixed = Math.min(MAX_NEW_PER_DAY, Math.max(0, next));
    setText(String(fixed));
    if (fixed !== value) save.mutate({ ...base, newPerDay: fixed });
  };
  const setDate = (next: string | null) => {
    setDateText(next ?? '');
    if ((next ?? '') === date) return;
    save.mutate({
      ...base,
      examDate: next,
      examDateSetAt: next ? new Date().toISOString() : null,
    });
  };

  const showsDate = useDateHint(node.id, plan, date);

  return {
    numberId,
    dateId,
    save,
    stored,
    base,
    value,
    extras,
    hasExtras,
    date,
    text,
    setText,
    dateText,
    setDateText,
    commit,
    setDate,
    showsDate,
    pace: paceOf(view, text),
    suggested: suggestedDateOf(node),
  };
}

/** While it loads, what this browser remembers: a student with a date does not see the page jump every time. */
function useDateHint(deckId: string, plan: StudyPlan | undefined, date: string): boolean {
  const hintKey = storageKeys.examDateHint(deckId);
  const [hint] = useState(() => {
    try {
      return localStorage.getItem(hintKey) === '1';
    } catch {
      return false;
    }
  });
  const showsDate = plan ? !!date : hint;
  useEffect(() => {
    if (!plan) return;
    try {
      if (date) localStorage.setItem(hintKey, '1');
      else localStorage.removeItem(hintKey);
    } catch {
      // blocked storage: it only costs a small jump on loading
    }
  }, [plan, date, hintKey]);
  return showsDate;
}

function suggestedDateOf(node: DeckNode): string | null {
  const date = node.course?.assessments.find((a) => a.id === node.assessmentId)?.suggestedDate;
  return date && dayOfDate(date) >= roughToday() ? date : null;
}
