// Demo-only heatmap history: a made-up, deterministic past added to what the demo student did in this browser.
import { dayOf } from '@qv/srs';
import type { Catalog } from '@qv/schema';
import type { StudyRepository } from '../../progress/api/repository';
import { browserTimeZone } from '../../progress/api/repository';
import type { HeatmapData } from '@qv/study';
import { storageKeys } from '../../../shared/lib/storage';

// For the e2e tests, `qv-demo-heatmap` in localStorage takes `empty`, `slow` (1.5 s late) and `error`, with commas.
export function withDemoHistory(
  study: StudyRepository,
  catalog: () => Promise<Catalog>,
  flags: () => string[] = demoFlags,
): StudyRepository {
  let decks: Promise<{ id: string; courseId: string }[]> | null = null;
  const leaves = () =>
    (decks ??= catalog()
      .then((c) => {
        const parents = new Set(c.anki.decks.map((d) => d.parentId));
        return c.anki.decks
          .filter((d) => d.courseId !== null && !parents.has(d.id) && d.cardCount > 0)
          .map((d) => ({ id: d.id, courseId: d.courseId! }));
      })
      .catch(() => {
        decks = null;
        return [];
      }));
  return {
    ...study,
    async heatmap(deckIds, quizIds = null) {
      const on = flags();
      if (on.includes('slow')) await new Promise((r) => setTimeout(r, 1500));
      if (on.includes('error')) throw new Error('No se pudo leer tus días de estudio.');
      const real = await study.heatmap(deckIds, quizIds);
      if (on.includes('empty')) return real;
      const today = dayOf(Date.now() / 1000, browserTimeZone(), 4);
      const all = await leaves();
      const only = deckIds === null ? null : new Set(deckIds);
      return merge(
        real,
        inventedHistory(
          today,
          all.map((d) => d.id),
          only,
        ),
      );
    },
  };
}

function demoFlags(): string[] {
  try {
    return (window.localStorage.getItem(storageKeys.demo.heatmap) ?? '')
      .split(',')
      .map((s) => s.trim());
  } catch {
    return [];
  }
}

/** mulberry32. */
function randomOf(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function inventedPast(today: number, deckIds: string[], only: ReadonlySet<string> | null) {
  const days: HeatmapData['days'] = [];
  for (let day = today - 420; day < today; day++) {
    const random = randomOf(day);
    const month = new Date(day * 86_400_000).getUTCMonth();
    const summer = month <= 1;
    const recent = today - day <= 10;
    if (!recent && random() > (summer ? 0.15 : 0.7)) continue;
    const answers = Math.round(15 + random() ** 2 * (summer ? 80 : 420));
    const deck = deckIds[Math.floor(random() * deckIds.length)]!;
    if (!only || only.has(deck)) days.push({ day, deckId: deck, answers, practice: 0 });
  }
  return days;
}

function inventedDue(today: number, deckIds: string[], only: ReadonlySet<string> | null) {
  const due: HeatmapData['due'] = [];
  for (let day = today; day <= today + 60; day++) {
    const random = randomOf(day + 7919);
    const deck = deckIds[Math.floor(random() * deckIds.length)]!;
    if (only && !only.has(deck)) continue;
    const cards = Math.round(160 * Math.exp(-(day - today) / 18) * (0.5 + random()));
    due.push({ day, cards });
  }
  return due;
}

function inventedHistory(
  today: number,
  deckIds: string[],
  only: ReadonlySet<string> | null,
): HeatmapData {
  if (!deckIds.length) return { days: [], due: [] };
  return { days: inventedPast(today, deckIds, only), due: inventedDue(today, deckIds, only) };
}

function merge(a: HeatmapData, b: HeatmapData): HeatmapData {
  const due = new Map<number, number>();
  for (const d of [...a.due, ...b.due]) due.set(d.day, (due.get(d.day) ?? 0) + d.cards);
  return {
    days: [...b.days, ...a.days].sort((x, y) => x.day - y.day),
    due: [...due].sort((x, y) => x[0] - y[0]).map(([day, cards]) => ({ day, cards })),
    ...(a.tests ? { tests: a.tests } : {}),
  };
}
