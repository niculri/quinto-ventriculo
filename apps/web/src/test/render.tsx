import { localAdminRepository } from '../features/admin/repository';
import type { AdminRepository } from '../features/admin/repository';
import { localAccountRepository } from '../features/account/repository';
import { localReportsRepository } from '../features/reports/repository';
import type { ReportsRepository } from '../features/reports/repository';
import type { AccountRepository } from '../features/account/repository';
import { render } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import type {
  AnkiTreeDeck,
  BrowseData,
  CardDetail,
  Catalog,
  DeckDetail,
  Note,
  QuizDetail,
  QuizSectionDetail,
  SearchResponse,
} from '@qv/schema';
import { LEGAL_VERSIONS } from '@qv/schema';
import { Providers } from '../app/Providers';
import { routes } from '../app/routes';
import type { Services } from '../app/services';
import { ApiRequestError } from '../lib/api';
import type { ApiClient } from '../lib/api';
import { localStudyRepository } from '../features/study/repository';
import type { StudyRepository } from '../features/study/repository';
import { localQuizRepository } from '../features/quiz/repository';
import type { QuizRepository } from '../features/quiz/repository';
import type { Session, SessionService } from '../features/session/service';

export const SESSION_ANA: Session = {
  token: 't',
  user: {
    id: 'u1',
    email: 'ana@ug.uchile.cl',
    name: 'Ana Pérez',
    avatar: null,
    createdAt: '2026-10-31T13:00:00.000Z',
    lastSignInAt: '2026-11-01T12:30:00.000Z',
  },
};

export const CATALOG: Catalog = {
  semesters: [
    {
      number: 1,
      name: '1° Semestre',
      courses: [
        {
          id: 'anatomia-1',
          semester: 1,
          name: 'Anatomía I',
          emoji: '🦴',
          position: 1,
          assessments: [
            {
              id: 'anatomia-1/certamen-1',
              courseId: 'anatomia-1',
              name: 'Certamen 1',
              position: 1,
              notes: [],
              quizzes: [],
              cardCount: 4,
            },
          ],
        },
      ],
    },
    {
      number: 2,
      name: '2° Semestre',
      courses: [
        {
          id: 'biologia-celular',
          semester: 2,
          name: 'Biología celular',
          emoji: '🧬',
          position: 1,
          assessments: [
            {
              id: 'biologia-celular/certamen-2',
              courseId: 'biologia-celular',
              name: 'Certamen 2',
              position: 2,
              notes: [
                {
                  id: 'AP-BC-C2-10',
                  slug: '10-nucleo-celular',
                  courseId: 'biologia-celular',
                  assessmentId: 'biologia-celular/certamen-2',
                  kind: 'lecture',
                  title: 'Núcleo celular',
                  position: 1,
                  updatedAt: '2026-10-30T12:00:00.000Z',
                },
                {
                  id: 'AP-BC-C2-11',
                  slug: '11-traduccion',
                  courseId: 'biologia-celular',
                  assessmentId: 'biologia-celular/certamen-2',
                  kind: 'lecture',
                  title: 'Traducción',
                  subtitle: 'Clase N.º 11',
                  position: 2,
                  updatedAt: '2026-10-31T12:00:00.000Z',
                },
              ],
              quizzes: [
                {
                  id: 'practica-biocel',
                  slug: 'practica',
                  courseId: 'biologia-celular',
                  assessmentId: 'biologia-celular/certamen-2',
                  title: 'Práctica de Biocel',
                  position: 1,
                  questionCount: 4,
                  sectionCount: 2,
                  updatedAt: '2026-10-31T12:00:00.000Z',
                },
              ],
              cardCount: 0,
            },
          ],
        },
        { id: 'fisica', semester: 2, name: 'Física', emoji: '🧲', position: 2, assessments: [] },
      ],
    },
  ],
  anki: {
    decks: [] as AnkiTreeDeck[],
    presets: [],
    noteTypes: [
      {
        id: '1',
        name: 'Prueba · Básica',
        kind: 'normal',
        occlusion: false,
        fields: ['Frente', 'Reverso'],
        templates: ['Directa'],
        sortField: 0,
      },
      {
        id: '2',
        name: 'Prueba · Cloze',
        kind: 'cloze',
        occlusion: false,
        fields: ['Texto', 'Extra'],
        templates: ['Cloze'],
        sortField: 0,
      },
      {
        id: '3',
        name: 'Prueba · Oclusión',
        kind: 'cloze',
        occlusion: true,
        fields: ['Oclusión', 'Imagen'],
        templates: ['Oclusión'],
        sortField: 0,
      },
    ],
  },
};

/** An article (v1.5): web code and version, header and «Ponte a prueba». */
export const NOTE: Note = {
  ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.notes[1]!,
  sources: ['Clase 11, «Traducción», semestre de primavera 2026: diapositivas y grabación.'],
  code: 'QV-BC-C2-11',
  version: 2,
  publishedAt: '2026-11-01T12:00:00.000Z',
  versionAt: '2026-11-03T12:00:00.000Z',
  header: {
    number: '11',
    lecturer: 'Prof. Luis Ejemplo A.',
    institution: 'ICBM, Universidad de Chile',
    term: 'spring',
    year: 2026,
  },
  practice: { quizId: 'practica-biocel', section: 'pautas', groups: ['02'] },
  html:
    '<h2 id="ribosomas">Ribosomas</h2><p>Dos subunidades.</p><img src="x" onerror="alert(1)">' +
    '<figure class="figure"><img src="/api/media/a.webp" alt="Ribosoma"><figcaption>El ribosoma</figcaption></figure>' +
    '<h3 id="sitios">Sitios A, P y E</h3><p>Texto.</p>',
  toc: [
    { anchor: 'ribosomas', title: 'Ribosomas', level: 2 },
    { anchor: 'sitios', title: 'Sitios A, P y E', level: 3 },
  ],
};

/** The test deck where the real ones are: root → semester → course → assessment → week → deck → Extras. */
export const WEEK =
  '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba';
export const DECK_PATH =
  '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba';

export const DECK: DeckDetail = {
  id: '20',
  name: 'Mazo de prueba',
  fullName: `${WEEK}::Mazo de prueba`,
  description: '',
  courseId: 'anatomia-1',
  assessmentId: 'anatomia-1/certamen-1',
  preset: 'Default',
  noteCount: 3,
  cardCount: 4,
  subdecks: [{ id: '21', name: 'Extras', parentId: '20', preset: 'Extras', cardCount: 1 }],
  cards: [
    {
      noteGuid: 's@/AqX%n?#',
      ord: 0,
      deckId: '20',
      code: 'T-PR-01-001',
      version: 2,
      kind: 'basic',
      text: '¿Cuántas vértebras cervicales hay?',
    },
    {
      noteGuid: 'cloze-1',
      ord: 0,
      deckId: '20',
      code: 'T-PR-01-002',
      version: 1,
      kind: 'cloze',
      text: 'La columna tiene 7 vértebras cervicales',
    },
    {
      noteGuid: 'cloze-1',
      ord: 1,
      deckId: '21',
      code: 'T-PR-01-002',
      version: 1,
      kind: 'cloze',
      text: 'La columna tiene 7 vértebras cervicales',
    },
    {
      noteGuid: 'oclusion-1',
      ord: 0,
      deckId: '20',
      code: 'T-PR-01-003',
      version: 1,
      kind: 'occlusion',
      text: 'Vértebra de prueba',
    },
  ],
  presets: [
    {
      name: 'Default',
      config: {
        new: { delays: [1, 10], perDay: 20, bury: true },
        rev: { perDay: 100, bury: true, maxIvl: 36500 },
        lapse: { delays: [10], leechAction: 0, leechFails: 8 },
        maxTaken: 60,
      },
    },
    {
      name: 'Extras',
      config: {
        new: { delays: [1, 10], perDay: 0, bury: true },
        rev: { perDay: 100, bury: true, maxIvl: 36500 },
        lapse: { delays: [10], leechAction: 0, leechFails: 8 },
        maxTaken: 60,
      },
    },
  ],
};

const tree = (
  id: string,
  name: string,
  parentId: string | null,
  level: Partial<AnkiTreeDeck>,
  cardCount = 4,
  preset = 'Default',
): AnkiTreeDeck => ({
  id,
  name,
  parentId,
  preset,
  semester: null,
  courseId: null,
  assessmentId: null,
  noteCount: cardCount === 4 ? 3 : 1,
  cardCount,
  ...level,
});
const inCourse = { semester: 1, courseId: 'anatomia-1' };
const inAssessment = { ...inCourse, assessmentId: 'anatomia-1/certamen-1' };
CATALOG.anki.decks = [
  tree('1', '() Medicina UCH', null, {}),
  tree('2', '() Medicina UCH::1° Semestre', '1', { semester: 1 }),
  tree('3', '() Medicina UCH::1° Semestre::🦴 Anatomía I', '2', inCourse),
  tree('4', '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1', '3', inAssessment),
  tree('5', WEEK, '4', inAssessment),
  tree('20', DECK.fullName, '5', inAssessment),
  tree('21', `${DECK.fullName}::Extras`, '20', inAssessment, 1, 'Extras'),
];
CATALOG.anki.presets = DECK.presets;

/** What `/api/decks/:id` gives for every deck of the tree (the same cards, from where it is). */
export function deckDetail(id: string): DeckDetail | null {
  const all = CATALOG.anki.decks;
  const d = all.find((x) => x.id === id);
  if (!d) return null;
  const below = all.filter((x) => x.name.startsWith(`${d.name}::`));
  const ids = new Set([d.id, ...below.map((x) => x.id)]);
  return {
    ...DECK,
    id: d.id,
    name: d.name.split('::').at(-1)!,
    fullName: d.name,
    courseId: d.courseId,
    assessmentId: d.assessmentId,
    preset: d.preset,
    noteCount: d.noteCount,
    cardCount: d.cardCount,
    subdecks: below.map((x) => ({
      id: x.id,
      name: x.name.split('::').at(-1)!,
      parentId: x.parentId,
      preset: x.preset,
      cardCount: x.cardCount,
    })),
    cards: DECK.cards.filter((c) => ids.has(c.deckId)),
  };
}

export const BROWSE: BrowseData = {
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

const colors = (c: string) =>
  Object.fromEntries(['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]));

/** A practice test with two tabs: two groups with choices (one with a figure beside), a short one. */
export const QUIZ: QuizDetail = {
  ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.quizzes[0]!,
  kicker: 'Certamen 2 · Biología celular',
  heading: 'Practica para el <b>Certamen 2</b>',
  footer: 'Pie del test',
  theme: { light: colors('#1F6F75'), dark: colors('#6CC3C8') } as QuizDetail['theme'],
  sections: [
    {
      id: 'pautas',
      name: 'Pautas de años pasados',
      label: 'Pauta original',
      description: 'Las 3 preguntas de alternativas.',
      notice: 'Aviso de las pautas',
      groupsTitle: 'Qué temas practicar',
      questionCount: 3,
      hasChoices: true,
      groups: [
        { id: '01', name: 'Transcripción', topic: 'Clases 8 y 9', questionCount: 2 },
        { id: '02', name: 'Núcleo', questionCount: 1 },
      ],
    },
    {
      id: 'nuevas',
      name: 'Preguntas nuevas',
      label: 'Pregunta nueva',
      description: 'Una pregunta nueva.',
      groupsTitle: 'Qué clases practicar',
      listing: {
        title: 'Materia que no salía',
        items: ['Tema suelto', { title: 'Clase 8', items: ['Hebra molde'] }],
      },
      questionCount: 1,
      hasChoices: false,
      groups: [{ id: '01', name: 'Clase 8', questionCount: 1 }],
    },
  ],
};

export const QUIZ_SECTIONS: Record<string, QuizSectionDetail> = {
  pautas: {
    quizId: QUIZ.id,
    sectionId: 'pautas',
    groups: [
      {
        id: '01',
        name: 'Transcripción',
        topic: 'Clases 8 y 9',
        questions: [
          {
            id: 'D-p01-03',
            kind: 'choice',
            context: 'Un gel de RT-PCR.',
            prompt: '¿Qué muestra el gel?',
            options: ['Splicing alternativo', 'Nada', 'Otra cosa'],
            correct: 0,
            optionExplanations: [
              '<b>Verdadera.</b> Dos tamaños.',
              '<b>Falsa.</b> Hay bandas.',
              '<b>Falsa.</b> No.',
            ],
            explanation: 'La idea clave.',
            origin: 'Certamen 2021',
            figures: [
              {
                kind: 'svg',
                svg: '<svg viewBox="0 0 10 10" role="img" aria-label="Gel"><rect width="10" height="10" fill="var(--ink)"/></svg>',
                caption: 'Imagen recreada a partir de la original.',
              },
            ],
            figureBeside: true,
            fixedOrder: false,
          },
          {
            id: 'D-p02-04',
            kind: 'choice',
            prompt: '¿Dónde se une TBP?',
            options: ['A la caja TATA', 'Al ribosoma'],
            correct: 0,
            table: {
              rows: [
                [
                  { html: 'Hormona', header: true },
                  { html: '1 min', header: false, highlight: true },
                ],
              ],
            },
            figures: [],
            figureBeside: false,
            fixedOrder: false,
          },
        ],
      },
      {
        id: '02',
        name: 'Núcleo',
        questions: [
          {
            id: 'A-p04-36',
            kind: 'choice',
            prompt: '¿Qué es la lámina?',
            options: ['Filamentos intermedios', 'Microtúbulos'],
            correct: 0,
            figures: [
              {
                kind: 'image',
                media: 'tests/x.webp',
                src: '/api/media/tests/x.webp',
                width: 40,
                height: 20,
                alt: 'Micrografía',
              },
            ],
            figureBeside: false,
            fixedOrder: false,
          },
        ],
      },
    ],
  },
  nuevas: {
    quizId: QUIZ.id,
    sectionId: 'nuevas',
    groups: [
      {
        id: '01',
        name: 'Clase 8',
        questions: [
          {
            id: 'N01-01',
            kind: 'short',
            prompt: '¿Qué hebra se copia?',
            answer: 'La molde',
            figures: [],
            figureBeside: false,
          },
        ],
      },
    ],
  },
};

export function fakeSession(initial: Session | null): SessionService & { signIns: string[] } {
  let current = initial;
  const listeners = new Set<(s: Session | null) => void>();
  const signIns: string[] = [];
  return {
    signIns,
    current: async () => current,
    subscribe: (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    signInWithGoogle: async (next) => {
      signIns.push(next);
    },
    signOut: async () => {
      current = null;
      listeners.forEach((f) => f(null));
    },
  };
}

export function fakeApi(changes: Partial<ApiClient> = {}): ApiClient {
  return {
    catalog: async () => CATALOG,
    note: async (slug) => {
      if (slug === NOTE.slug) return NOTE;
      throw new ApiRequestError(404, 'not_found', 'Ese apunte no existe.');
    },
    deck: async (id) => {
      const d = deckDetail(id);
      if (d) return d;
      throw new ApiRequestError(404, 'not_found', 'Ese mazo no existe.');
    },
    ankiNotes: async () => BROWSE,
    cardChanges: async (since) => ({ changes: [], next: since, latest: since, more: false }),
    quizzes: async () => ({ quizzes: [] }),
    quiz: async (id) => {
      if (id === QUIZ.id) return QUIZ;
      throw new ApiRequestError(404, 'not_found', 'Ese test no existe.');
    },
    quizSection: async (id, section) => {
      const s = id === QUIZ.id ? QUIZ_SECTIONS[section] : undefined;
      if (s) return s;
      throw new ApiRequestError(404, 'not_found', 'Esa sección del test no existe.');
    },
    card: async (guid, ord) => {
      const c = CARDS[`${guid}/${ord}`];
      if (c) return c;
      throw new ApiRequestError(404, 'not_found', 'Esa tarjeta no existe.');
    },
    search: async (query): Promise<SearchResponse> => ({
      query,
      results: [
        {
          noteId: NOTE.id,
          noteSlug: NOTE.slug,
          noteTitle: NOTE.title,
          courseName: 'Biología celular',
          anchor: 'ribosomas',
          section: 'Ribosomas',
          snippet: 'Tienen dos ⟦subunidades⟧.',
          score: 1,
        },
      ],
    }),
    // The release panel's (step 1.7): only for an administrator; a student gets «no existe».
    releaseOverview: notAdmin,
    releaseCards: notAdmin,
    releaseArticles: notAdmin,
    releaseQuestions: notAdmin,
    releaseTexts: notAdmin,
    releaseMedia: notAdmin,
    setReleaseMark: notAdmin,
    publishRelease: notAdmin,
    revertRelease: notAdmin,
    releaseLog: notAdmin,
    // The site's settings (step 1.8): only for an administrator.
    siteSettings: notAdmin,
    setSiteSettings: notAdmin,
    // What was taken off the site (step 2.10): only for an administrator.
    unpublishedLog: notAdmin,
    ...changes,
  };
}

const notAdmin = async (): Promise<never> => {
  throw new ApiRequestError(404, 'not_found', 'No existe esa ruta.');
};

/**
 * In memory, in «Modo avanzado», which is what most tests exercise (the buttons, the limits and the presets
 * as Anki's), with the week of the test catalog turned on. A student who just arrived is `localStudyRepository(null)`.
 */
export function fullAnkiStudy(): StudyRepository {
  const study = localStudyRepository(null, {
    fullAnki: true,
    fourButtons: true,
    welcomeSeen: true,
  });
  void study.setDeckActivation('5', true);
  return study;
}

/** An account that already accepted the terms and the privacy policy in force. */
export function acceptedAccount(email = SESSION_ANA.user.email): AccountRepository {
  return localAccountRepository({
    email,
    initial: {
      accepted: {
        terms: LEGAL_VERSIONS.terms.version,
        privacy: LEGAL_VERSIONS.privacy.version,
        acceptedAt: '2026-11-08T12:00:00.000Z',
      },
    },
  });
}

export function renderApp(
  /** The URL, or a history entry with its state (a reload keeps the entry's state). */
  route: string | { pathname: string; state: unknown },
  op: {
    session?: Session | null;
    api?: ApiClient;
    study?: StudyRepository;
    quiz?: QuizRepository;
    admin?: AdminRepository;
    /** The reports (step 2.6); by default in memory, for an administrator if `admin` is one. */
    reports?: ReportsRepository;
    /** The account (step 2.3); by default the versions in force are already accepted. */
    account?: AccountRepository;
    /** The API asking for the draft (the preview, step 1.7). */
    previewApi?: ApiClient;
  } = {},
) {
  const session = fakeSession(op.session === undefined ? SESSION_ANA : op.session);
  const services: Services = {
    session,
    api: op.api ?? fakeApi(),
    // In memory: each test starts with nothing studied.
    study: op.study ?? fullAnkiStudy(),
    quiz: op.quiz ?? localQuizRepository(null),
    admin: op.admin ?? localAdminRepository(),
    reports: op.reports ?? localReportsRepository({ admin: true }),
    account: op.account ?? acceptedAccount(),
    ...(op.previewApi ? { previewApi: op.previewApi } : {}),
  };
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const r = render(
    <Providers
      services={services}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...r, router, session };
}
