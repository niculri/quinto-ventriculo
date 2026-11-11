import type { AnkiTreeDeck, CardDetail, CardIndex, CardIndexNote, Catalog } from '@qv/schema';
import { CARD_INDEX_VERSION } from '@qv/schema';
import type { ApiClient } from '../../lib/api';
import type { StoredCard, StudyRepository } from '../study/repository';

/**
 * Made-up cards for the cards page (step 3.3): nothing of anybody, words drawn from a small list. The tests of speed
 * use them (8,000 notes), and the demo mode shows them instead of the real index when `qv-demo-cards` is a number in
 * this browser («800»): every kind of row, topics, origins and a made-up progress (seen, difficult, marked, hidden).
 * Deterministic: the same page on every visit.
 */

export const DEMO_PREFIX = 'demo-';

/** A fixed sequence (mulberry32): a «random» that is the same on every visit. */
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

const WORDS = [
  'lámina',
  'vértice',
  'surco',
  'borde',
  'cara',
  'proceso',
  'fosa',
  'conducto',
  'cresta',
  'tubérculo',
  'membrana',
  'pliegue',
  'receso',
  'espacio',
  'canal',
  'ramo',
  'tronco',
  'plexo',
  'arco',
  'seno',
];
const SIDES = ['superior', 'inferior', 'medial', 'lateral', 'anterior', 'posterior', 'profundo'];

const TYPES = [
  {
    id: '-91',
    name: 'Demo · Básica',
    kind: 'normal' as const,
    fields: ['Tema', 'Frente', 'Reverso'],
  },
  { id: '-92', name: 'Demo · Cloze', kind: 'cloze' as const, fields: ['Tema', 'Texto'] },
  {
    id: '-93',
    name: 'Demo · Oclusión',
    kind: 'cloze' as const,
    fields: ['Encabezado', 'Oclusión'],
  },
  {
    id: '-94',
    name: 'Demo · Foto',
    kind: 'normal' as const,
    fields: ['Encabezado', 'Pregunta', 'Respuesta', 'Etiqueta'],
  },
];

/** The decks an assessment's cards go in: its lowest decks with cards and their Extras. */
function decksOf(decks: readonly AnkiTreeDeck[], assessmentId: string) {
  const mine = decks.filter((d) => d.assessmentId === assessmentId);
  const isExtras = (d: AnkiTreeDeck) => d.name.endsWith('::Extras');
  const lectures = mine.filter(
    (d) => !isExtras(d) && !mine.some((x) => x.parentId === d.id && !isExtras(x)),
  );
  return lectures.map((d) => ({
    id: d.id,
    extras: mine.find((x) => x.parentId === d.id && x.name.endsWith('::Extras'))?.id ?? d.id,
  }));
}

/** `count` made-up notes of an assessment, in its decks: about one in six an image, a few photos in a row. */
export function syntheticIndex(
  assessmentId: string,
  decks: readonly AnkiTreeDeck[],
  count: number,
  seed = 7,
): CardIndex {
  const random = randomOf(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
  const lectures = decksOf(decks, assessmentId);
  const notes: CardIndexNote[] = [];
  if (!lectures.length) return { version: CARD_INDEX_VERSION, assessmentId, noteTypes: [], notes };
  const perLecture = Math.ceil(count / lectures.length);
  let topic = '';
  for (let i = 0; i < count; i++) {
    const lecture = lectures[Math.min(lectures.length - 1, Math.floor(i / perLecture))]!;
    if (i % 7 === 0) topic = `${pick(WORDS)} ${pick(SIDES)}`.replace(/^./, (c) => c.toUpperCase());
    const r = random();
    const kind = r < 0.58 ? 'basic' : r < 0.8 ? 'cloze' : r < 0.92 ? 'occlusion' : 'photo';
    const a = pick(WORDS);
    const b = pick(SIDES);
    const code = `T-DM-01-${String(i + 1).padStart(4, '0')}`;
    const deckOf = () => (random() < 0.2 ? lecture.extras : lecture.id);
    const cards =
      kind === 'cloze'
        ? [0, 1].map((ord) => ({ ord, deckId: deckOf() }))
        : kind === 'occlusion'
          ? Array.from({ length: 2 + Math.floor(random() * 10) }, (_, ord) => ({
              ord,
              deckId: deckOf(),
            }))
          : [{ ord: 0, deckId: deckOf() }];
    const type = TYPES[['basic', 'cloze', 'occlusion', 'photo'].indexOf(kind)]!;
    const front =
      kind === 'basic'
        ? `¿Qué limita el ${a} ${b} número ${i + 1}?`
        : kind === 'cloze'
          ? `El ${a} {{c1::${b}}} se continúa con el {{c2::${pick(WORDS)}::estructura}} (${i + 1}).`
          : kind === 'occlusion'
            ? `Lámina de prueba ${i + 1}: ${a} ${b}`
            : `Preparado ${i + 1}`;
    const back =
      kind === 'basic' ? `El ${pick(WORDS)} ${pick(SIDES)}` : kind === 'photo' ? `${a} ${b}` : '';
    const origin = (['profe', 'control', 'clinica', 'complemento'] as const).filter(
      (_, k) => random() < [0.25, 0.04, 0.08, 0.2][k]!,
    );
    const fields =
      kind === 'basic'
        ? [topic, front, back]
        : kind === 'cloze'
          ? [topic, front.replace(/\{\{c\d::|::estructura|\}\}/g, '')]
          : kind === 'occlusion'
            ? [front, '']
            : [front, '', '', back];
    notes.push({
      guid: `${DEMO_PREFIX}${assessmentId}-${i}`,
      noteTypeId: type.id,
      tags: [...origin],
      code,
      version: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
      fields,
      sortField: fields[1] || fields[0]!,
      cards,
      kind,
      topic: kind === 'basic' || kind === 'cloze' ? topic : front,
      front,
      back,
      thumb: null,
      labels: kind === 'occlusion' ? cards.length : 0,
      origin,
    });
  }
  return {
    version: CARD_INDEX_VERSION,
    assessmentId,
    noteTypes: TYPES.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      occlusion: t.name.endsWith('Oclusión'),
      fields: t.fields,
      templates: [t.kind === 'cloze' ? 'Cloze' : 'Directa'],
      sortField: 1,
    })),
    notes,
  };
}

/** A made-up progress for some of those cards: seen, a few difficult, marked or hidden. */
export function syntheticRows(index: CardIndex, nowMs: number, seed = 11): StoredCard[] {
  const random = randomOf(seed);
  const out: StoredCard[] = [];
  for (const n of index.notes) {
    for (const c of n.cards) {
      const r = random();
      if (r > 0.45) continue;
      const hard = r < 0.06;
      out.push({
        noteGuid: n.guid,
        ord: c.ord,
        deckId: c.deckId,
        phase: 'review',
        interday: true,
        remainingSteps: 0,
        due: new Date(nowMs + Math.ceil(random() * 20) * 86_400_000).toISOString(),
        interval: 5,
        stability: hard ? 1.2 : 8,
        difficulty: hard ? 9 : 5,
        reps: hard ? 6 : 3,
        lapses: hard ? 3 : 0,
        lastReview: new Date(nowMs - 2 * 86_400_000).toISOString(),
        flag: random() < 0.06 ? 1 : 0,
        suspended: random() < 0.03,
        buriedUntil: null,
        leech: false,
        updatedAt: new Date(nowMs).toISOString(),
      });
    }
  }
  return out;
}

/** How many made-up notes the demo shows (`qv-demo-cards`), or null: the real index. */
export function demoCardCount(storage: Storage | null = safeStorage()): number | null {
  const n = Number(storage?.getItem('qv-demo-cards') ?? '');
  return Number.isInteger(n) && n > 0 ? Math.min(n, 20_000) : null;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A made-up card's sides: the same frame as any card, with its row's text. */
function syntheticCard(note: CardIndexNote, ord: number, deckId: string): CardDetail {
  const kind = note.kind === 'basic' || note.kind === 'cloze' ? note.kind : 'basic';
  const answer =
    note.kind === 'basic' || note.kind === 'photo'
      ? note.back
      : note.kind === 'cloze'
        ? note.front.replace(/\{\{c\d::([^:}]*)(::[^}]*)?\}\}/g, '<b>$1</b>')
        : `Rótulo ${ord + 1}`;
  const question =
    note.kind === 'cloze'
      ? note.front.replace(
          /\{\{c\d::([^:}]*)(::([^}]*))?\}\}/g,
          (_, _a, _h, hint) => `[${hint ?? '…'}]`,
        )
      : note.front;
  return {
    noteGuid: note.guid,
    ord,
    deckId,
    code: note.code,
    version: note.version,
    kind,
    front: `<div class="pregunta">${question}</div>`,
    back: `<div class="pregunta">${question}</div><hr id="answer" /><div class="respuesta">${answer}</div>`,
    css: '.card { font-family: sans-serif; font-size: 20px; text-align: center; padding: 24px; }',
  };
}

/**
 * The demo's API and progress with made-up cards instead of the real index (only with `qv-demo-cards`): every
 * assessment's index, its cards' sides and some progress in them.
 */
export function withDemoCards(
  api: ApiClient,
  study: StudyRepository,
  count: () => number | null = demoCardCount,
): { api: ApiClient; study: StudyRepository } {
  const made = new Map<string, CardIndex>();
  let catalog: Promise<Catalog> | null = null;
  const indexOf = async (assessmentId: string) => {
    const n = count();
    if (n === null) return null;
    const key = `${assessmentId}/${n}`;
    if (!made.has(key)) {
      const c = await (catalog ??= api.catalog());
      made.set(key, syntheticIndex(assessmentId, c.anki.decks, n));
    }
    return made.get(key)!;
  };
  const noteOf = (guid: string) => {
    for (const i of made.values()) {
      const note = i.notes.find((x) => x.guid === guid);
      if (note) return note;
    }
    return null;
  };
  return {
    api: {
      ...api,
      async catalog(signal, options) {
        const c = await api.catalog(signal, options);
        if (count() === null) return c;
        // Every assessment with decks has an index (the made-up one).
        return {
          ...c,
          semesters: c.semesters.map((s) => ({
            ...s,
            courses: s.courses.map((course) => ({
              ...course,
              assessments: course.assessments.map((a) =>
                c.anki.decks.some((d) => d.assessmentId === a.id)
                  ? {
                      ...a,
                      cardIndex: { hash: '0'.repeat(32), noteCount: 0, cardCount: 0, bytes: 0 },
                    }
                  : a,
              ),
            })),
          })),
        };
      },
      async cardIndex(assessmentId, hash, signal) {
        return (await indexOf(assessmentId)) ?? api.cardIndex(assessmentId, hash, signal);
      },
      async card(guid, ord, signal) {
        if (!guid.startsWith(DEMO_PREFIX)) return api.card(guid, ord, signal);
        const note = noteOf(guid);
        const card = note?.cards.find((c) => c.ord === ord);
        if (!note || !card) return api.card(guid, ord, signal);
        return syntheticCard(note, ord, card.deckId);
      },
    },
    study: {
      ...study,
      async cards(deckIds) {
        const real = await study.cards(deckIds);
        if (count() === null) return real;
        const ids = new Set(deckIds);
        const c = await (catalog ??= api.catalog());
        const assessments = new Set(
          c.anki.decks.filter((d) => ids.has(d.id) && d.assessmentId).map((d) => d.assessmentId!),
        );
        for (const a of assessments) await indexOf(a);
        const madeUp = [...made.values()].flatMap((i) =>
          syntheticRows(i, Date.now()).filter((r) => ids.has(r.deckId)),
        );
        const seen = new Set(real.map((r) => `${r.noteGuid}\u001f${r.ord}`));
        return [...real, ...madeUp.filter((r) => !seen.has(`${r.noteGuid}\u001f${r.ord}`))];
      },
    },
  };
}
