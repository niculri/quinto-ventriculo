// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// What a study session's end screens say, from its data as it is now: Anki's congratulations (congrats.rs), the
// assessment's notes, and whether today has answers in some decks or an assessment was ever seen.
import { nextLearnMessage } from '@qv/srs';
import { assessmentView } from './pace';
import { cardKey, isHidden, subtree, timingFor, toRecord } from './scheduler';
import type { StudyData } from './scheduler';
import type { CongratsInfo, ExamNotes } from './session';
import { ancestorName, ASSESSMENT_DEPTH, decksGivingNew, extrasOff, isExtras } from './simple';

interface Scan {
  info: Pick<
    CongratsInfo,
    'reviewLimitReached' | 'newLimitReached' | 'buried' | 'dueTomorrow' | 'inactiveNew'
  >;
  learnCount: number;
  nextLearn: number | null;
  anyActive: boolean;
}

function countCard(
  scan: Scan,
  record: ReturnType<typeof toRecord>,
  today: number,
  givesNew: boolean,
  inExtras: boolean,
): void {
  const { info } = scan;
  if (!record) {
    if (givesNew) info.newLimitReached = true;
    else if (!inExtras) info.inactiveNew++;
  } else if (record.queue === 'learn') {
    scan.learnCount++;
    scan.nextLearn = scan.nextLearn === null ? record.due : Math.min(scan.nextLearn, record.due);
  } else if (record.due <= today) info.reviewLimitReached = true;
  else if (record.due === today + 1) info.dueTomorrow++;
}

function scanCards(
  data: StudyData,
  active: ReadonlySet<string>,
  extras: ReadonlySet<string>,
  givingNew: ReadonlySet<string>,
  now: number,
  today: number,
): Scan {
  const scan: Scan = {
    info: {
      reviewLimitReached: false,
      newLimitReached: false,
      buried: false,
      dueTomorrow: 0,
      inactiveNew: 0,
    },
    learnCount: 0,
    nextLearn: null,
    anyActive: false,
  };
  for (const c of data.deck.cards) {
    if (!active.has(c.deckId)) continue;
    const givesNew = givingNew.has(c.deckId);
    const inExtras = extras.has(c.deckId);
    if (givesNew && !inExtras) scan.anyActive = true;
    const row = data.rows.get(cardKey(c));
    if (row?.suspended) continue;
    if (isHidden(row, now)) {
      scan.info.buried = true;
      continue;
    }
    countCard(scan, toRecord(row, data.prefs), today, givesNew, inExtras);
  }
  return scan;
}

export function congratsInfo(
  data: StudyData,
  rootId: string,
  now: number,
  learnAheadSecs: number,
): CongratsInfo {
  const timing = timingFor(data.prefs, now);
  const decks = subtree(data.decks, rootId);
  const active = new Set(decks.map((d) => d.id));
  const extras = new Set(decks.filter((d) => isExtras(d.name)).map((d) => d.id));
  const givingNew = decksGivingNew(data.decks, data.plan);
  const { info, learnCount, nextLearn, anyActive } = scanCards(
    data,
    active,
    extras,
    givingNew,
    now,
    timing.today,
  );
  // Anki: the next learning card, counted to when it enters the learn-ahead limit (at least a minute).
  const secs = nextLearn === null ? 86_400 : Math.max(60, nextLearn - learnAheadSecs - timing.now);
  return {
    ...info,
    nothingActive: !anyActive,
    extrasOff: extrasOff(data.decks, data.plan, rootId),
    learnMessage: nextLearnMessage(secs, learnCount),
    exam: examNotes(data, rootId, timing.today),
  };
}

// What was due in this session's decks is gone by the end; the assessment's other decks are as when it opened.
function examNotes(data: StudyData, rootId: string, today: number): ExamNotes | null {
  const root = data.decks.find((d) => d.id === rootId);
  const name = root ? ancestorName(root.name, ASSESSMENT_DEPTH) : null;
  const assessmentId = data.decks.find((d) => d.name === name)?.id;
  if (!assessmentId) return null;
  const here = new Set(subtree(data.decks, rootId).map((d) => d.id));
  const view = assessmentView({
    decks: data.decks,
    plan: data.plan,
    progress: (data.progress ?? []).map((p) => (here.has(p.deckId) ? { ...p, overdue: 0 } : p)),
    assessmentId,
    today,
    prefs: data.prefs,
  });
  return {
    computed: view.pace.kind === 'computed',
    finalReview: view.pace.kind === 'final-review',
    lastNewDay: view.lastNewDay,
    roseTo: view.rose ? view.pace.newPerDay : null,
    catchUp: view.catchUp,
  };
}

export function answeredTodayIn(data: StudyData, deckIds: ReadonlySet<string>): boolean {
  return data.answers.some((a) => deckIds.has(a.deckId));
}

export function hasSeenAssessment(data: StudyData, assessmentId: string): boolean {
  const root = data.decks.find((d) => d.id === assessmentId);
  if (!root) return false;
  const inside = new Set(subtree(data.decks, assessmentId).map((d) => d.id));
  return (
    (data.progress ?? []).some((p) => inside.has(p.deckId) && p.seen > 0) ||
    data.answers.some((a) => inside.has(a.deckId))
  );
}
