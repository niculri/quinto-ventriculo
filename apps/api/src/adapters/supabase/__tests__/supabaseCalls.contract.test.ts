// Records every request the Worker's Supabase adapters make (method, path, query, headers, body) and what each method
// gives back, on the content database and with the student's token: a change must leave the snapshot as it is.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseAccessChecker } from '../access';
import { supabaseAdminChecker } from '../admin';
import { contentDatabaseCheck, usersDatabaseCheck } from '../health';
import { supabaseUsageStats } from '../usageStats';
import { contentClient } from '../client';
import { supabaseReleaseRepository } from '../release';
import { supabaseRepository } from '../content';
import { supabaseSiteSettingsRepository } from '../settings';
import { supabaseUnpublishedRepository } from '../unpublished';

const URL_ = 'https://content.example.test/';
const KEY = 'service-test-key';

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

type Answer = { status?: number; body: unknown };

function recorder(answer: (call: Call) => Answer | undefined) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    calls.push({
      method: req.method,
      path: decodeURIComponent(url.pathname + url.search),
      headers: Object.fromEntries(
        [...req.headers]
          .filter(([k]) => k !== 'x-client-info')
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      ...(text ? { body: JSON.parse(text) as unknown } : {}),
    });
    const { status = 200, body } = answer(calls.at(-1)!) ?? { body: [] };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  vi.stubGlobal('fetch', fetch);
  return { calls, fetch };
}

async function shown(result: unknown): Promise<unknown> {
  if (result instanceof ReadableStream) return `stream: ${await new Response(result).text()}`;
  return result;
}

async function run(steps: [string, () => Promise<unknown>][], calls: Call[]) {
  const out: { step: string; calls: Call[]; result?: unknown; error?: string }[] = [];
  for (const [step, fn] of steps) {
    const before = calls.length;
    try {
      const result = await shown(await fn());
      out.push({ step, calls: calls.slice(before), result });
    } catch (e) {
      out.push({ step, calls: calls.slice(before), error: (e as Error).message });
    }
  }
  return out;
}

const rpcName = (c: Call) => /\/rest\/v1\/rpc\/([a-z_]+)/.exec(c.path)?.[1];
const table = (c: Call) => /\/rest\/v1\/([a-z_]+)/.exec(c.path)?.[1];
const refusal = (code: string, message: string, details: string | null = null): Answer => ({
  status: 400,
  body: { code, message, details, hint: null },
});

const SEARCH_ROWS = [
  {
    note_id: 'n1',
    note_slug: 'n1',
    note_title: 'Nota',
    course_name: 'Ramo',
    anchor: 'a',
    section: 'S',
    snippet: 's',
    score: 1,
  },
];

const CONTENT_ANSWERS: Record<string, unknown> = {
  semesters: [{ number: 1, name: 'Primer semestre' }],
  anki_deck_tree: [
    {
      id: '1',
      name: 'Raíz',
      parent: null,
      preset: null,
      semester: 1,
      course_id: null,
      assessment_id: null,
      note_count: 2,
      card_count: 3,
      own_note_count: 0,
      exclusive_note_count: 2,
      closed_note_count: 2,
    },
  ],
  quiz_detail: null,
  anki_card: null,
  anki_card_changes_since: { changes: [], latest: 0, more: false },
  quiz_section: { questions: [] },
  anki_decks: [{ course_id: 'biologia-celular' }],
  anki_deck_detail: { id: '1' },
  search_notes: SEARCH_ROWS,
  search_notes_except: SEARCH_ROWS,
};

afterEach(() => vi.unstubAllGlobals());

describe('content database: the calls of each adapter', () => {
  for (const schema of ['public', 'draft'] as const) {
    it(`content (${schema})`, async () => {
      const { calls } = recorder((c) => {
        const name = rpcName(c) ?? table(c) ?? '';
        if (name === 'notes' && c.path.includes('slug=eq.')) return { body: [] };
        return name in CONTENT_ANSWERS ? { body: CONTENT_ANSWERS[name] } : undefined;
      });
      const repo = supabaseRepository(URL_, KEY, schema);
      const out = await run(
        [
          ['catalog', () => repo.catalog()],
          ['quizzes', () => repo.quizzes()],
          ['quiz', () => repo.quiz('q1')],
          ['quizSectionJson', () => repo.quizSectionJson('q1', 's1')],
          ['deckJson', () => repo.deckJson('1')],
          ['cardChanges', () => repo.cardChanges(5, 100)],
          ['card', () => repo.card('g1', 0)],
          ['note', () => repo.note('n1')],
          ['search', () => repo.search('nucleo', 10)],
          ['search except', () => repo.search('nucleo', 10, ['fisica'])],
          ['courses', () => repo.courses()],
          ['deckCourse', () => repo.deckCourse('1')],
        ],
        calls,
      );
      expect(out).toMatchSnapshot();
    });
  }

  it('release', async () => {
    const { calls } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'release_media') return { body: { keys: ['a.png'], next: null } };
      if (fn === 'set_release_mark') {
        return c.body && (c.body as { checked: boolean }).checked
          ? refusal('P0409', 'set_release_mark: stale')
          : { body: [] };
      }
      if (fn === 'publish_release') return refusal('P0422', 'publish_release: marks', 'phone');
      if (fn === 'revert_release') return refusal('XX000', 'boom');
      if (fn === 'release_log') return { body: [] };
      return { body: { ok: true } };
    });
    const repo = supabaseReleaseRepository(URL_, KEY);
    const publish = {
      fingerprint: 'f',
      title: 'T',
      schemaVersion: 1,
      checks: {},
      marks: ['phone'],
      by: 'admin@ug.uchile.cl',
    } as unknown as Parameters<typeof repo.publish>[0];
    const out = await run(
      [
        ['summaryJson', () => repo.summaryJson()],
        ['browseIndexesJson', () => repo.browseIndexesJson()],
        ['itemsJson', () => repo.itemsJson('a1', 'card', null)],
        ['textsJson', () => repo.textsJson('k')],
        ['media', () => repo.media(null, 50)],
        ['setMark, stale', () => repo.setMark('f', 'phone', true, 'admin@ug.uchile.cl')],
        ['setMark', () => repo.setMark('f', 'answers', false, 'admin@ug.uchile.cl')],
        ['publish, refused', () => repo.publish(publish)],
        ['revert, failing', () => repo.revert(3, 'admin@ug.uchile.cl')],
        ['log', () => repo.log()],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });

  it('site settings and the unpublished log', async () => {
    const { calls } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'site_settings' || fn === 'set_site_settings') {
        return {
          body: {
            hideEmptySemesters: true,
            hiddenCourses: ['fisica'],
            updatedAt: '2026-11-10T07:00:00+00:00',
            updatedBy: 'admin@ug.uchile.cl',
          },
        };
      }
      if (fn === 'unpublish_log_entries') {
        return {
          body: {
            total: 1,
            entries: [
              {
                kind: 'note',
                id: 'n1',
                title: 'T',
                reason: 'r',
                by: 'admin@ug.uchile.cl',
                doneAt: '2026-11-10T07:00:00+00:00',
                removed: {},
              },
            ],
          },
        };
      }
      return undefined;
    });
    const settings = supabaseSiteSettingsRepository(URL_, KEY);
    const unpublished = supabaseUnpublishedRepository(URL_, KEY);
    const out = await run(
      [
        ['get', () => settings.get()],
        ['set', () => settings.set({ hideEmptySemesters: false, by: 'admin@ug.uchile.cl' })],
        [
          'set courses',
          () => settings.set({ hiddenCourses: ['fisica'], by: 'admin@ug.uchile.cl' }),
        ],
        ['log', () => unpublished.log()],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });
});

describe('one client for every repository, as the Worker makes them', () => {
  it('makes the same calls as a client each', async () => {
    const steps = (client?: ReturnType<typeof contentClient>) => {
      const published = supabaseRepository(URL_, KEY, 'public', client);
      const draft = supabaseRepository(URL_, KEY, 'draft', client);
      const release = supabaseReleaseRepository(URL_, KEY, client);
      const settings = supabaseSiteSettingsRepository(URL_, KEY, client);
      const unpublished = supabaseUnpublishedRepository(URL_, KEY, client);
      return [
        ['catalog', () => published.catalog()],
        ['draft catalog', () => draft.catalog()],
        ['note', () => published.note('n1')],
        ['draft search', () => draft.search('x', 3)],
        ['media', () => release.media('k', 10)],
        ['log', () => release.log()],
        ['settings', () => settings.get()],
        ['unpublished', () => unpublished.log()],
      ] as [string, () => Promise<unknown>][];
    };
    const separate = recorder(() => undefined);
    const each = await run(steps(), separate.calls);
    const shared = recorder(() => undefined);
    expect(await run(steps(contentClient(URL_, KEY)), shared.calls)).toEqual(each);
  });
});

describe('users database with the student’s token: the calls', () => {
  it('access, administrators, usage and health', async () => {
    const { calls, fetch } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'access_status') return { body: 'allowed' };
      if (fn === 'is_admin' || fn === 'health') return { body: true };
      if (fn === 'admin_usage') return { body: { ok: true } };
      return { body: {} };
    });
    const op = { supabaseUrl: 'https://users.example.test/', publishableKey: 'pk', fetch };
    const access = supabaseAccessChecker({ ...op, legal: { terms: 't1', privacy: 'p1' } });
    const admin = supabaseAdminChecker(op);
    const usage = supabaseUsageStats(op);
    const out = await run(
      [
        ['access', () => access.check('student-token')],
        ['isAdminNow', () => admin.isAdminNow!('student-token')],
        ['usage', () => usage.stats('admin-token', { decks: {}, quizzes: {} })],
        [
          'users health',
          () => usersDatabaseCheck(op.supabaseUrl, 'pk', fetch)(new AbortController().signal),
        ],
        [
          'content health',
          () => contentDatabaseCheck(URL_, KEY, fetch)(new AbortController().signal),
        ],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });
});
