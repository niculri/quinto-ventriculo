// Fixes how the API answers each kind of input (path parameters, queries, bodies and the headers it reads), valid and
// invalid, at the limits, and what reaches the repositories: a change in validation shows up as a snapshot diff.
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { cardIndexKey } from '@qv/schema';
import type { ContentBundle, QuizSummary } from '@qv/schema';
import { createApp } from '../app';
import { MediaSigner } from '../services/mediaSigner';
import { memoryRepository } from '../adapters/memory/content';
import { memorySiteSettings } from '../adapters/memory/settings';
import type { ContentRepository } from '../ports/content';
import type { ReleaseRepository } from '../ports/releases';

/** The gzip header names the system that wrote it (byte 9), and the snapshot keeps the bytes: one value everywhere. */
const GZIPPED_INDEX = (() => {
  const bytes = new Uint8Array(gzipSync('{"cards":[]}'));
  bytes[9] = 19;
  return bytes;
})();

const NOW = 1_793_448_000;
const USER = 'user-token';
const ADMIN = 'admin-token';
const HASH = '0123456789abcdef0123456789abcdef';
const FP = 'f'.repeat(32);
const IMAGE = 'cards/hay.webp';

const bundle = (title: string): ContentBundle => ({
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [{ id: 'curso', semester: 2, name: 'Curso', emoji: '🧬', position: 1 }],
  assessments: [{ id: 'curso/certamen-2', courseId: 'curso', name: 'Certamen 2', position: 2 }],
  notes: [
    {
      id: 'AP-X-01',
      slug: 'a-b',
      courseId: 'curso',
      assessmentId: 'curso/certamen-2',
      kind: 'lecture',
      title,
      position: 1,
      updatedAt: '2026-10-31T12:00:00.000Z',
      sources: [],
      html: `<p>${title}</p>`,
      toc: [],
      sections: [],
      hash: title,
      media: [],
    },
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
});

const quiz = (id: string, courseId: string, assessmentId: string, position: number) =>
  ({ id, courseId, assessmentId, position }) as unknown as QuizSummary;
const QUIZZES = [
  quiz('q3', 'b', 'b/c1', 1),
  quiz('q1', 'a', 'a/c1', 2),
  quiz('q2', 'a', 'a/c2', 1),
];

let calls: unknown[][] = [];
/** Remembers a call and answers `value`. */
const seen = <T>(value: T, ...call: unknown[]): T => {
  calls.push(call);
  return value;
};

const content = (title: string): ContentRepository => {
  const memory = memoryRepository(bundle(title));
  return {
    ...memory,
    note: async (slug) => seen(await memory.note(slug), 'note', slug),
    search: async (query, limit) => seen([], 'search', query, limit),
    deckJson: async (id) => seen(id === '1' ? '{"deck":1}' : null, 'deckJson', id),
    cardChanges: async (since, limit) =>
      seen({ changes: [], next: since, latest: since, more: false }, 'cardChanges', since, limit),
    card: async (guid, ord) => seen(null, 'card', guid, ord),
    quizzes: async () => QUIZZES,
    quiz: async (id) => seen(null, 'quiz', id),
    quizSectionJson: async (id, section) => seen(null, 'quizSectionJson', id, section),
  };
};

const EMPTY_PAGE = '{"items":[],"next":null}';
const refused = { ok: false as const, reason: 'invalid', detail: null };
const releases: ReleaseRepository = {
  summaryJson: async () => '{}',
  browseIndexesJson: async () => '[]',
  itemsJson: async (assessment, kind, after) =>
    seen(EMPTY_PAGE, 'itemsJson', assessment, kind, after),
  textsJson: async (after) => seen(EMPTY_PAGE, 'textsJson', after),
  media: async (after, limit) => seen({ keys: [], next: null }, 'media', after, limit),
  setMark: async (fingerprint, mark, checked, by) =>
    seen(fingerprint === FP ? [] : 'stale', 'setMark', fingerprint, mark, checked, by),
  publish: async (input) => seen(refused, 'publish', input.fingerprint, input.title),
  revert: async (id, by) => seen(refused, 'revert', id, by),
  log: async () => ({ releases: [] }),
};

const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');
const INDEX_KEY = cardIndexKey('curso/certamen-2', HASH);
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp({
    verifier: {
      verify: async (token) =>
        token === USER || token === ADMIN ? { id: token, email: `${token}@ug.uchile.cl` } : null,
    },
    repository: content('Publicado'),
    preview: content('Borrador'),
    media: {
      get: async (key) => {
        seen(null, 'media.get', key);
        if (key === INDEX_KEY) return { body: GZIPPED_INDEX, contentType: 'x' };
        return key === IMAGE ? { body: new Uint8Array([1]), contentType: 'image/webp' } : null;
      },
    },
    signer,
    now: () => NOW,
    admins: { isAdmin: async (token) => token === ADMIN },
    releases,
    settings: memorySiteSettings({}, () => new Date('2026-11-14T12:00:00.000Z')),
    usageEvents: { record: (event) => seen(null, 'record', event) },
  });
});

interface Case {
  path: string;
  method?: string;
  token?: string | null;
  headers?: Record<string, string>;
  body?: string;
}

/** Status, the error (or a short piece of the body), the headers the API sets and what reached the repositories. */
async function answer(c: Case) {
  calls = [];
  const token = c.token === undefined ? USER : c.token;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...c.headers,
  };
  const r = await app.request(c.path, {
    method: c.method ?? 'GET',
    headers,
    ...(c.body !== undefined ? { body: c.body } : {}),
  });
  const text = await r.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text.slice(0, 80);
  }
  return {
    status: r.status,
    body,
    headers: Object.fromEntries(
      ['cache-control', 'vary', 'x-qv-preview', 'content-encoding']
        .map((h): [string, string | null] => [h, r.headers.get(h)])
        .filter(([, v]) => v !== null),
    ),
    calls,
  };
}

const run = async (cases: Record<string, Case>) => {
  const out: Record<string, unknown> = {};
  for (const [name, c] of Object.entries(cases)) out[name] = await answer(c);
  return out;
};

const long = (n: number) => 'a'.repeat(n);

describe('the answer to each input stays the same', () => {
  it('Authorization', async () => {
    const auth = (value: string | null): Case => ({
      path: '/api/me',
      token: null,
      headers: value === null ? {} : { Authorization: value },
    });
    expect(
      await run({
        missing: auth(null),
        empty: auth(''),
        bearer: auth(`Bearer ${USER}`),
        lowercase: auth(`bearer ${USER}`),
        uppercase: auth(`BEARER ${USER}`),
        twoSpaces: auth(`Bearer  ${USER}`),
        tab: auth(`Bearer\t${USER}`),
        trailingSpace: auth(`Bearer ${USER} `),
        leadingSpace: auth(` Bearer ${USER}`),
        twoWords: auth(`Bearer ${USER} x`),
        noSpace: auth(`Bearer${USER}`),
        basic: auth(`Basic ${USER}`),
        onlyScheme: auth('Bearer'),
        schemeAndSpace: auth('Bearer '),
        unknownToken: auth('Bearer otro'),
      }),
    ).toMatchSnapshot();
  });

  it('X-QV-Preview', async () => {
    const preview = (value: string | null, token = ADMIN): Case => ({
      path: '/api/notes/a-b',
      token,
      headers: value === null ? {} : { 'X-QV-Preview': value },
    });
    expect(
      await run({
        missing: preview(null),
        draft: preview('draft'),
        capitalized: preview('Draft'),
        uppercase: preview('DRAFT'),
        spaces: preview(' draft '),
        plural: preview('drafts'),
        empty: preview(''),
        one: preview('1'),
        lowercaseName: { ...preview(null), headers: { 'x-qv-preview': 'draft' } },
        student: preview('draft', USER),
      }),
    ).toMatchSnapshot();
  });

  it('notes, decks and tests by id', async () => {
    expect(
      await run({
        note: { path: '/api/notes/a-b' },
        noteMissing: { path: '/api/notes/zz' },
        noteEncoded: { path: '/api/notes/%61-b' },
        noteUppercase: { path: '/api/notes/A-b' },
        noteDoubleDash: { path: '/api/notes/a--b' },
        noteLeadingDash: { path: '/api/notes/-a' },
        noteTrailingDash: { path: '/api/notes/a-' },
        noteSpace: { path: '/api/notes/a%20b' },
        noteAccent: { path: '/api/notes/%C3%A1' },
        noteSlash: { path: '/api/notes/..%2Fsecreto' },
        noteLong: { path: `/api/notes/${long(500)}` },
        noteEmpty: { path: '/api/notes/' },
        deck: { path: '/api/decks/1' },
        deckMissing: { path: '/api/decks/0' },
        deck20: { path: `/api/decks/${'9'.repeat(20)}` },
        deck21: { path: `/api/decks/${'9'.repeat(21)}` },
        deckLetters: { path: '/api/decks/abc' },
        deckNegative: { path: '/api/decks/-1' },
        deckDecimal: { path: '/api/decks/1.5' },
        deckEncoded: { path: '/api/decks/%31' },
        quiz: { path: '/api/quizzes/practica' },
        quizUppercase: { path: '/api/quizzes/Practica' },
        quizSpace: { path: '/api/quizzes/con%20espacio' },
        section: { path: '/api/quizzes/practica/sections/pautas' },
        sectionBad: { path: '/api/quizzes/practica/sections/X_Y' },
        sectionQuizBad: { path: '/api/quizzes/X/sections/pautas' },
      }),
    ).toMatchSnapshot();
  });

  it('search and the list of tests', async () => {
    const search = (query: string): Case => ({ path: `/api/search${query}` });
    expect(
      await run({
        none: search(''),
        short: search('?q=a'),
        spaces: search('?q=%20%20ab%20%20'),
        long: search(`?q=${long(250)}`),
        twice: search('?q=uno&q=dos'),
        limitZero: search('?q=ab&limit=0'),
        limitNegative: search('?q=ab&limit=-5'),
        limitBig: search('?q=ab&limit=100'),
        limitText: search('?q=ab&limit=abc'),
        limitDecimal: search('?q=ab&limit=3.7'),
        limitExponent: search('?q=ab&limit=1e3'),
        limitSpace: search('?q=ab&limit=%207'),
        limitEmpty: search('?q=ab&limit='),
        quizzes: { path: '/api/quizzes' },
        quizzesCourse: { path: '/api/quizzes?course=a' },
        quizzesBoth: { path: '/api/quizzes?course=a&assessment=a/c2' },
        quizzesEmpty: { path: '/api/quizzes?course=&assessment=' },
        quizzesOther: { path: '/api/quizzes?course=zz' },
      }),
    ).toMatchSnapshot();
  });

  it('the cards: index, changes, a card', async () => {
    const index = (course: string, assessment: string, hash: string, gzip = true): Case => ({
      path: `/api/anki/index/${course}/${assessment}/${hash}`,
      headers: gzip ? { 'Accept-Encoding': 'gzip, br' } : {},
    });
    expect(
      await run({
        index: index('curso', 'certamen-2', HASH),
        indexPlain: index('curso', 'certamen-2', HASH, false),
        indexGzipUppercase: {
          ...index('curso', 'certamen-2', HASH),
          headers: { 'Accept-Encoding': 'GZIP' },
        },
        indexXGzip: {
          ...index('curso', 'certamen-2', HASH),
          headers: { 'Accept-Encoding': 'x-gzip' },
        },
        indexGzipped: {
          ...index('curso', 'certamen-2', HASH),
          headers: { 'Accept-Encoding': 'gzipped' },
        },
        indexPreview: {
          ...index('curso', 'certamen-2', HASH),
          token: ADMIN,
          headers: { 'X-QV-Preview': 'draft', 'Accept-Encoding': 'gzip' },
        },
        indexMissing: index('curso', 'certamen-1', HASH),
        index80: index(long(80), 'c', HASH),
        index81: index(long(81), 'c', HASH),
        indexUppercase: index('Curso', 'c', HASH),
        indexUnderscore: index('cu_rso', 'c', HASH),
        indexEncoded: index('%63urso', 'certamen-2', HASH),
        indexHash31: index('curso', 'certamen-2', HASH.slice(1)),
        indexHash33: index('curso', 'certamen-2', `${HASH}0`),
        indexHashUppercase: index('curso', 'certamen-2', HASH.toUpperCase()),
        changes: { path: '/api/anki/card-changes' },
        changesZero: { path: '/api/anki/card-changes?since=0' },
        changes15: { path: `/api/anki/card-changes?since=${'9'.repeat(15)}` },
        changes16: { path: `/api/anki/card-changes?since=${'9'.repeat(16)}` },
        changesLeadingZero: { path: '/api/anki/card-changes?since=007' },
        changesNegative: { path: '/api/anki/card-changes?since=-1' },
        changesDecimal: { path: '/api/anki/card-changes?since=1.0' },
        changesSpace: { path: '/api/anki/card-changes?since=%201' },
        changesEncoded: { path: '/api/anki/card-changes?since=%31' },
        changesEmpty: { path: '/api/anki/card-changes?since=' },
        changesText: { path: '/api/anki/card-changes?since=abc' },
        card: { path: '/api/cards/abc/0' },
        card9999: { path: '/api/cards/abc/9999' },
        card10000: { path: '/api/cards/abc/10000' },
        cardOrdLeadingZero: { path: '/api/cards/abc/007' },
        cardOrdNegative: { path: '/api/cards/abc/-1' },
        cardOrdText: { path: '/api/cards/abc/x' },
        cardGuidEncoded: { path: `/api/cards/${encodeURIComponent('a/b%c?d')}/1` },
        cardGuidSpace: { path: '/api/cards/a%20b/1' },
        cardGuid64: { path: `/api/cards/${long(64)}/1` },
        cardGuid65: { path: `/api/cards/${long(65)}/1` },
        cardGuidAccent: { path: '/api/cards/%C3%A1/1' },
      }),
    ).toMatchSnapshot();
  });

  it('images', async () => {
    const url = await signer.url(IMAGE, NOW);
    const query = url.slice(url.indexOf('?'));
    const e = /e=(\d+)/.exec(url)![1]!;
    const s = /s=([^&]+)/.exec(url)![1]!;
    const thumbs = await signer.prefixQuery('cards/thumb/', NOW);
    expect(
      await run({
        signed: { path: url, token: null },
        missingImage: { path: `/api/media/cards/no.webp${query}`, token: null },
        withoutQuery: { path: `/api/media/${IMAGE}`, token: null },
        badExpiry: { path: `/api/media/${IMAGE}?e=abc&s=${s}`, token: null },
        decimalExpiry: { path: `/api/media/${IMAGE}?e=${e}.0&s=${s}`, token: null },
        emptyExpiry: { path: `/api/media/${IMAGE}?e=&s=${s}`, token: null },
        withoutSignature: { path: `/api/media/${IMAGE}?e=${e}`, token: null },
        uppercaseKey: { path: `/api/media/CARDS/hay.webp${query}`, token: null },
        dotsKey: { path: `/api/media/cards/..%2Fx.webp${query}`, token: null },
        oneSegment: { path: `/api/media/hay.webp${query}`, token: null },
        prefix: {
          path: `/api/media/cards/thumb/${HASH}.webp?${thumbs.query}`,
          token: null,
        },
        otherPrefix: {
          path: `/api/media/cards/thumb/${HASH}.webp?${thumbs.query.replace('thumb', 'otro')}`,
          token: null,
        },
        emptyPrefix: { path: `/api/media/${IMAGE}?e=${e}&p=&s=${s}`, token: null },
      }),
    ).toMatchSnapshot();
  });

  it('the release panel', async () => {
    const admin = (path: string, method = 'GET', body?: string): Case => ({
      path,
      method,
      token: ADMIN,
      ...(body !== undefined ? { body, headers: { 'Content-Type': 'application/json' } } : {}),
    });
    const mark = (body: unknown) => admin('/api/admin/release/marks', 'PUT', JSON.stringify(body));
    expect(
      await run({
        student: { path: '/api/admin/release/items?kind=card&assessment=a/b' },
        items: admin('/api/admin/release/items?kind=card&assessment=a/b'),
        itemsAfter: admin(
          `/api/admin/release/items?kind=article&assessment=a/b&after=${long(200)}`,
        ),
        itemsAfterLong: admin(
          `/api/admin/release/items?kind=card&assessment=a/b&after=${long(201)}`,
        ),
        itemsAfterEmpty: admin('/api/admin/release/items?kind=card&assessment=a/b&after='),
        itemsKind: admin('/api/admin/release/items?kind=note&assessment=a/b'),
        itemsNoKind: admin('/api/admin/release/items?assessment=a/b'),
        itemsNoAssessment: admin('/api/admin/release/items?kind=card'),
        itemsOneSegment: admin('/api/admin/release/items?kind=card&assessment=a'),
        itemsThreeSegments: admin('/api/admin/release/items?kind=card&assessment=a/b/c'),
        itemsUppercase: admin('/api/admin/release/items?kind=card&assessment=A/b'),
        itemsEncoded: admin('/api/admin/release/items?kind=card&assessment=a%2Fb'),
        texts: admin('/api/admin/release/texts'),
        texts300: admin(`/api/admin/release/texts?after=${long(300)}`),
        texts301: admin(`/api/admin/release/texts?after=${long(301)}`),
        textsEmpty: admin('/api/admin/release/texts?after='),
        media: admin('/api/admin/release/media'),
        media300: admin(`/api/admin/release/media?after=${long(300)}`),
        media301: admin(`/api/admin/release/media?after=${long(301)}`),
        mark: mark({ fingerprint: FP, mark: 'phone', checked: true }),
        markStale: mark({ fingerprint: '0'.repeat(32), mark: 'answers', checked: false }),
        markExtra: mark({ fingerprint: FP, mark: 'phone', checked: true, more: 1 }),
        markUppercase: mark({ fingerprint: FP.toUpperCase(), mark: 'phone', checked: true }),
        markShort: mark({ fingerprint: FP.slice(1), mark: 'phone', checked: true }),
        markNumber: mark({ fingerprint: 1, mark: 'phone', checked: true }),
        markKind: mark({ fingerprint: FP, mark: 'otra', checked: true }),
        markChecked: mark({ fingerprint: FP, mark: 'phone', checked: 'true' }),
        markWithout: mark({ fingerprint: FP, mark: 'phone' }),
        markArray: mark([FP, 'phone', true]),
        markNull: mark(null),
        markString: mark('phone'),
        markEmpty: admin('/api/admin/release/marks', 'PUT', ''),
        markBroken: admin('/api/admin/release/marks', 'PUT', '{"fingerprint":'),
        publishEmpty: admin('/api/admin/release/publish', 'POST', '{}'),
        publishBroken: admin('/api/admin/release/publish', 'POST', 'x'),
        revert: admin('/api/admin/release/revert', 'POST', '{"id":3}'),
        revertZero: admin('/api/admin/release/revert', 'POST', '{"id":0}'),
        revertText: admin('/api/admin/release/revert', 'POST', '{"id":"3"}'),
        settings: admin('/api/admin/site-settings', 'PUT', '{"hideEmptySemesters":true}'),
        settingsExtra: admin(
          '/api/admin/site-settings',
          'PUT',
          '{"hideEmptySemesters":true,"by":"x"}',
        ),
        settingsText: admin('/api/admin/site-settings', 'PUT', '{"hideEmptySemesters":"true"}'),
        settingsBroken: admin('/api/admin/site-settings', 'PUT', '{'),
        settingsNothing: admin('/api/admin/site-settings', 'PUT', '{}'),
        settingsCourses: admin('/api/admin/site-settings', 'PUT', '{"hiddenCourses":[]}'),
        settingsCourseUnknown: admin(
          '/api/admin/site-settings',
          'PUT',
          '{"hiddenCourses":["no-existe"]}',
        ),
        settingsCourseText: admin('/api/admin/site-settings', 'PUT', '{"hiddenCourses":"a"}'),
        settingsCourseEmptyId: admin('/api/admin/site-settings', 'PUT', '{"hiddenCourses":[""]}'),
      }),
    ).toMatchSnapshot();
  });

  it('a length limit counts UTF-16 units, as `.length` does: an emoji is two', async () => {
    const emoji = (n: number) => '😀'.repeat(n);
    const admin = (path: string): Case => ({ path, token: ADMIN });
    const items = (after: string) =>
      admin(`/api/admin/release/items?kind=card&assessment=a/b&after=${after}`);
    const open = (body: string): Case => ({ path: '/api/usage/open', method: 'POST', body });
    // The last `id` is the one JSON.parse keeps: the first only makes the text long.
    const padded = (n: number) => {
      const body = `{"kind":"note","id":"${emoji(n)}","id":"a-b"}`;
      expect(body.length).toBe(34 + 2 * n);
      return open(body);
    };
    const out = await run({
      items100: items(emoji(100)),
      items101: items(emoji(101)),
      texts150: admin(`/api/admin/release/texts?after=${emoji(150)}`),
      texts151: admin(`/api/admin/release/texts?after=${emoji(151)}`),
      media150: admin(`/api/admin/release/media?after=${emoji(150)}`),
      media151: admin(`/api/admin/release/media?after=${emoji(151)}`),
      open512: padded(239),
      open514: padded(240),
    });
    const status = Object.fromEntries(
      Object.entries(out).map(([k, v]) => [k, (v as { status: number }).status]),
    );
    expect(status).toEqual({
      items100: 200,
      items101: 400,
      texts150: 200,
      texts151: 400,
      media150: 200,
      media151: 400,
      open512: 200,
      open514: 400,
    });
    expect((out.open514 as { calls: unknown[][] }).calls).toEqual([]);
  });

  it('usage counts', async () => {
    const open = (body: string): Case => ({ path: '/api/usage/open', method: 'POST', body });
    expect(
      await run({
        note: open('{"kind":"note","id":"a-b"}'),
        notPublished: open('{"kind":"note","id":"zz"}'),
        search: open('{"kind":"search","from":"home"}'),
        searchContext: open('{"kind":"search","from":"otro"}'),
        extra: open('{"kind":"note","id":"a-b","x":1}'),
        kind: open('{"kind":"page","id":"a-b"}'),
        broken: open('{"kind":'),
        empty: open(''),
        nullBody: open('null'),
        at512: open(`{"kind":"note","id":"a-b"}${' '.repeat(512 - 26)}`),
        at513: open(`{"kind":"note","id":"a-b"}${' '.repeat(513 - 26)}`),
        preview: {
          ...open('{"kind":"note","id":"a-b"}'),
          token: ADMIN,
          headers: { 'X-QV-Preview': 'draft' },
        },
      }),
    ).toMatchSnapshot();
  });
});
