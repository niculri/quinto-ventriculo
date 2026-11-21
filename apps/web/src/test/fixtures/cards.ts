// The cards of the test deck: what the explorer lists, the index of the assessment and each card as it is shown.
import type { BrowseData, CardDetail, CardIndex } from '@qv/schema';
import { CATALOG } from './catalog';

const BROWSE: BrowseData = {
  notes: [
    {
      guid: 's@/AqX%n?#',
      noteTypeId: '1',
      tags: ['columna::cervical', 'prueba'],
      code: 'T-PR-01-001',
      version: 2,
      createdAt: '2026-10-08T12:00:00.000Z',
      fields: ['¿Cuántas vértebras cervicales hay?', '7'],
      sortField: '¿Cuántas vértebras cervicales hay?',
      cards: [{ ord: 0, deckId: '20' }],
    },
    {
      guid: 'cloze-1',
      noteTypeId: '2',
      tags: ['columna'],
      code: 'T-PR-01-002',
      version: 1,
      createdAt: '2026-10-09T12:00:00.000Z',
      fields: ['La columna tiene {{c1::7}} vértebras {{c2::cervicales}}', ''],
      sortField: 'La columna tiene 7 vértebras cervicales',
      cards: [
        { ord: 0, deckId: '20' },
        { ord: 1, deckId: '21' },
      ],
    },
    {
      guid: 'oclusion-1',
      noteTypeId: '3',
      tags: [],
      code: 'T-PR-01-003',
      version: 1,
      createdAt: null,
      fields: ['{{c1::image-occlusion:rect:left=.1}}', 'Vértebra de prueba'],
      sortField: 'Vértebra de prueba',
      cards: [{ ord: 0, deckId: '20' }],
    },
  ],
};

export const CARD_INDEX: CardIndex = {
  version: 1,
  assessmentId: 'anatomia-1/certamen-1',
  noteTypes: CATALOG.anki.noteTypes,
  notes: [
    {
      ...BROWSE.notes[0]!,
      kind: 'basic',
      topic: 'Columna cervical',
      front: '¿Cuántas vértebras cervicales hay?',
      back: '7',
      thumb: null,
      labels: 0,
      origin: ['profe'],
    },
    {
      ...BROWSE.notes[1]!,
      kind: 'cloze',
      topic: 'Columna cervical',
      front: 'La columna tiene {{c1::7}} vértebras {{c2::cervicales}}',
      back: '',
      thumb: null,
      labels: 0,
      origin: [],
    },
    {
      ...BROWSE.notes[2]!,
      kind: 'occlusion',
      topic: 'Vértebra de prueba',
      front: 'Vértebra de prueba',
      back: '',
      thumb: 'cards/thumb/0123456789abcdef0123456789abcdef.webp',
      labels: 1,
      origin: [],
    },
  ],
};

const CSS = `.card { --fondo: #ffffff; background-color: var(--fondo); }
.card.nightMode { --fondo: #1c1f24; }
#image-occlusion-canvas { --active-shape-color: #ff7b72; --inactive-shape-color: #ffe08a; }
.pie { position: fixed; right: 10px; bottom: 6px; }`;

export const CARDS: Record<string, CardDetail> = {
  's@/AqX%n?#/0': {
    noteGuid: 's@/AqX%n?#',
    ord: 0,
    deckId: '20',
    code: 'T-PR-01-001',
    version: 2,
    kind: 'basic',
    front:
      '<div class="pregunta">¿Cuántas vértebras <b>cervicales</b> hay?</div>' +
      '<a class="hint" href="#">Pista</a><div class="hint" style="display:none">Empieza con 7</div>' +
      '<img src="x" onerror="alert(1)"><div class="pie">T-PR-01-001.2</div>',
    back: '<div class="pregunta">¿Cuántas?</div><hr id="answer" /><div class="respuesta"><b>7</b></div>',
    css: CSS,
  },
  'cloze-1/0': {
    noteGuid: 'cloze-1',
    ord: 0,
    deckId: '20',
    code: 'T-PR-01-002',
    version: 1,
    kind: 'cloze',
    front: 'La columna tiene <span class="cloze" data-ordinal="1">[...]</span> vértebras',
    back: 'La columna tiene <span class="cloze" data-ordinal="1">7</span> vértebras',
    css: CSS,
  },
  'oclusion-1/0': {
    noteGuid: 'oclusion-1',
    ord: 0,
    deckId: '20',
    code: 'T-PR-01-003',
    version: 1,
    kind: 'occlusion',
    front:
      '<div style="display:none"><div class="cloze" data-ordinal="1" data-shape="rect" data-left=".1" data-top=".1" data-width=".2" data-height=".2" data-occludeinactive="1"></div></div>' +
      '<div id="image-occlusion-container"><img src="/api/media/cards/a.webp"><canvas id="image-occlusion-canvas"></canvas></div>',
    back:
      '<div style="display:none"><div class="cloze-highlight" data-ordinal="1" data-shape="rect" data-left=".1" data-top=".1" data-width=".2" data-height=".2" data-occludeinactive="1"></div></div>' +
      '<div id="image-occlusion-container"><img src="/api/media/cards/a.webp"><canvas id="image-occlusion-canvas"></canvas></div>' +
      '<div><button id="toggle">Mostrar / ocultar máscaras</button></div>',
    css: CSS,
  },
};
