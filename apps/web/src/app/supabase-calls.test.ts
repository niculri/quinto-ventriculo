// Records every request the users-database adapters make through a real supabase-js client (method, path, query,
// headers and body), and what each method gives back: a change to an adapter must leave the snapshot as it is.
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseAccountRepository } from '../features/account/api/repository';
import { supabaseAdminRepository } from '../features/admin/api/repository';
import { supabaseQuizRepository } from '../features/quiz/api/repository';
import { supabaseReportsRepository } from '../features/reports/api/repository';
import { supabaseStudyRepository } from '../features/study/api/repository';

const URL_ = 'https://users.example.test';
const KEY = 'publishable-test-key';

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
    const call: Call = {
      method: req.method,
      path: decodeURIComponent(url.pathname + url.search),
      headers: Object.fromEntries(
        [...req.headers]
          .filter(([k]) => k !== 'x-client-info')
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      ...(text ? { body: JSON.parse(text) as unknown } : {}),
    };
    calls.push(call);
    const { status = 200, body } = answer(call) ?? { body: [] };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  return { client, calls, fetch };
}

/** Each method's calls and its result (or its error's message), in order. */
async function run(steps: [string, () => Promise<unknown>][], calls: Call[]) {
  const out: { step: string; calls: Call[]; result?: unknown; error?: string }[] = [];
  for (const [step, fn] of steps) {
    const before = calls.length;
    try {
      const result = await fn();
      out.push({
        step,
        calls: calls.slice(before),
        result: result instanceof Blob ? 'Blob' : result,
      });
    } catch (e) {
      out.push({ step, calls: calls.slice(before), error: (e as Error).message });
    }
  }
  return out;
}

const rpcName = (c: Call) => /\/rest\/v1\/rpc\/([a-z_]+)/.exec(c.path)?.[1];
const table = (c: Call) => /\/rest\/v1\/([a-z_]+)/.exec(c.path)?.[1];

const CARD_ROW = {
  note_guid: 'g1',
  ord: 0,
  deck_id: 'd1',
  phase: 'review',
  interday: true,
  remaining_steps: 0,
  due: '2026-11-12T09:00:00+00:00',
  interval: 3,
  stability: 4.5,
  difficulty: 6,
  reps: 3,
  lapses: 1,
  last_review: '2026-11-09T12:00:00+00:00',
  flag: 0,
  suspended: false,
  buried_until: null,
  leech: false,
  updated_at: '2026-11-09T12:00:00.123456+00:00',
  retired_at: null,
};
const PRESET = {
  id: 'p1',
  name: 'Mío',
  replaces: null,
  config: { newPerDay: 10 },
  updated_at: '2026-11-09T12:00:00+00:00',
};
const REF = { noteGuid: 'g1', ord: 0, deckId: 'd1' };
const AT = new Date('2026-11-10T07:00:00Z');

afterEach(() => vi.unstubAllGlobals());

describe('users database: the calls of each adapter', () => {
  it('study', async () => {
    let pgrst202 = true;
    const { client, calls } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'card_states_of_decks') {
        if (pgrst202) {
          pgrst202 = false;
          return {
            status: 404,
            body: { code: 'PGRST202', message: 'Could not find the function' },
          };
        }
        return { body: [CARD_ROW] };
      }
      if (fn === 'median_answer_ms') return { body: 1234 };
      if (fn === 'study_heatmap') return { body: { days: [['2026-11-09', 'd1', 3, 1]], due: [] } };
      if (fn === 'home_counts') {
        return { body: { decks: [['d1', 1, 0, 1, 0, 0.9, [['g1', 0, 'review', 'x']]]] } };
      }
      if (fn === 'record_review') return { body: { updatedAt: '2026-11-10T07:00:01+00:00' } };
      if (fn === 'reconcile_cards') return { body: { applied: true, syncedTo: '7', changed: 1 } };
      if (fn === 'undo_last_review') return { body: null };
      if (fn) return { body: null };
      const t = table(c);
      if (t === 'card_states' && c.method === 'GET') return { body: [CARD_ROW] };
      if (t === 'study_preferences' && c.method === 'GET') {
        return {
          body: [
            {
              time_zone: 'America/Santiago',
              day_starts_at: 4,
              learn_ahead_minutes: 20,
              new_cards_ignore_review_limit: false,
              apply_all_parent_limits: false,
              full_anki: false,
              four_buttons: false,
              welcome_seen: true,
              semester: null,
              added_courses: [],
              removed_courses: [],
              dismissed: [],
            },
          ],
        };
      }
      if (t === 'user_presets') return { body: c.method === 'GET' ? [PRESET] : PRESET };
      if (t === 'card_sync') return { body: [{ synced_to: 5, repair_from: null }] };
      return { body: c.method === 'GET' ? [] : null };
    });
    const repo = supabaseStudyRepository(client);
    const prefs = {
      timeZone: 'America/Santiago',
      dayStartsAt: 4,
      learnAheadMinutes: 20,
      newCardsIgnoreReviewLimit: false,
      applyAllParentLimits: false,
      fullAnki: false,
      fourButtons: false,
      welcomeSeen: true,
      semester: 2,
      addedCourses: ['c1'],
      removedCourses: [],
      dismissed: ['tip'],
    };
    vi.useFakeTimers({ now: AT, toFake: ['Date'] });
    const review = {
      card: REF,
      expectedUpdatedAt: CARD_ROW.updated_at,
      rating: 3 as const,
      queueBefore: 'review' as const,
      interval: 4,
      lastInterval: 3,
      durationMs: 5000,
      state: { phase: 'review' },
      bury: [{ noteGuid: 'g1', ord: 1, deckId: 'd1' }],
      buriedUntil: null,
    } as unknown as Parameters<typeof repo.recordReview>[0];
    const steps: [string, () => Promise<unknown>][] = [
      ['cards, without the function', () => repo.cards(['d1', 'd2'])],
      ['cards', () => repo.cards(['d1'])],
      ['cards of no decks', () => repo.cards([])],
      ['allCards', () => repo.allCards()],
      ['cardLog', () => repo.cardLog({ noteGuid: 'g1', ord: 0 })],
      ['ratedSince', () => repo.ratedSince(AT)],
      ['ratedBetween', () => repo.ratedBetween(AT, new Date('2026-11-11T07:00:00Z'))],
      ['firstAnswersSince', () => repo.firstAnswersSince(AT)],
      ['answersSince', () => repo.answersSince(AT)],
      ['preferences', () => repo.preferences()],
      ['savePreferences', () => repo.savePreferences(prefs)],
      ['presets', () => repo.presets()],
      ['savePreset, new', () => repo.savePreset({ name: 'Mío', replaces: null, config: { a: 1 } })],
      ['savePreset', () => repo.savePreset({ id: 'p1', name: 'Mío', replaces: 'x', config: {} })],
      ['deletePreset', () => repo.deletePreset('p1')],
      ['deckSettings', () => repo.deckSettings()],
      ['setDeckPreset, preset', () => repo.setDeckPreset('d1', { presetId: 'p1' })],
      ['setDeckPreset, author', () => repo.setDeckPreset('d1', { authorPreset: 'Autor' })],
      ['setDeckPreset, none', () => repo.setDeckPreset('d1', null)],
      ['deckActivations', () => repo.deckActivations()],
      ['setDeckActivation', () => repo.setDeckActivation('d1', true)],
      ['assessmentSettings', () => repo.assessmentSettings()],
      [
        'saveAssessmentSetting',
        () => repo.saveAssessmentSetting({ deckId: 'd1', includeExtras: true, newPerDay: 20 }),
      ],
      ['answeredDecks', () => repo.answeredDecks()],
      ['medianAnswerMs', () => repo.medianAnswerMs()],
      ['deckProgress', () => repo.deckProgress(AT)],
      ['recordReview, before syncing', () => repo.recordReview(review)],
      ['cardsSyncedTo', () => repo.cardsSyncedTo()],
      ['recordReview', () => repo.recordReview(review)],
      ['bury', () => repo.bury([REF], AT, true)],
      ['suspend', () => repo.suspend([REF], false)],
      ['setFlag', () => repo.setFlag(REF, 2)],
      ['setFlags', () => repo.setFlags([REF], 0)],
      ['unsuspend', () => repo.unsuspend([REF])],
      ['unbury', () => repo.unbury([REF])],
      ['forget', () => repo.forget([REF], true)],
      ['undo', () => repo.undo()],
      ['heatmap of all', () => repo.heatmap(null)],
      ['heatmap', () => repo.heatmap(['d1'])],
      [
        'recordPractice',
        () =>
          repo.recordPractice([
            { deckId: 'd1', n: 2 },
            { deckId: 'd2', n: 0 },
          ]),
      ],
      ['recordPractice of nothing', () => repo.recordPractice([])],
      ['homeCounts', () => repo.homeCounts(['d1'], AT, { d1: 0.9 })],
      ['homeCounts of no decks', () => repo.homeCounts([], AT, {})],
      ['reconcileCards', () => repo.reconcileCards({ since: 5, upTo: 7, changes: [] })],
      ['recordReview, after reconciling', () => repo.recordReview(review)],
    ];
    const out = await run(steps, calls);
    vi.useRealTimers();
    expect(out).toMatchSnapshot();
  });

  it('quiz', async () => {
    const { client, calls } = recorder((c) =>
      table(c) === 'quiz_progress'
        ? {
            body: [
              {
                section_id: 's1',
                preferences: {},
                round: null,
                updated_at: '2026-11-09T12:00:00Z',
              },
            ],
          }
        : undefined,
    );
    const repo = supabaseQuizRepository(client);
    const step = { quizId: 'q1', sectionId: 's1' } as unknown as Parameters<typeof repo.save>[0];
    const out = await run(
      [
        ['load', () => repo.load('q1')],
        ['save', () => repo.save(step)],
        ['openRounds', () => repo.openRounds()],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });

  it('admin', async () => {
    const { client, calls } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'is_admin') return { body: true };
      if (fn === 'admin_access_report') {
        return {
          body: { open_to_domain: false, lists: [], invited: [], accounts_without_invite: [] },
        };
      }
      if (fn === 'admin_invite_emails') {
        return { body: { added_emails: ['a@ug.uchile.cl'], already_emails: [], rejected: [] } };
      }
      if (fn === 'admin_remove_invites') {
        return {
          body: {
            removed: [],
            not_invited: [],
            kept_admins: [],
            sessions_closed: 0,
            open_to_domain: false,
          },
        };
      }
      if (fn === 'admin_set_admin') return { body: { admin: true } };
      return undefined;
    });
    const repo = supabaseAdminRepository(client);
    const out = await run(
      [
        ['isAdmin', () => repo.isAdmin()],
        ['deckImpact', () => repo.deckImpact(['d1'])],
        ['accessReport', () => repo.accessReport()],
        ['invite', () => repo.invite({ emails: ['a@ug.uchile.cl'], list: 'L', note: null })],
        ['invite with a note', () => repo.invite({ emails: [], list: 'L', note: 'n' })],
        ['removeInvites', () => repo.removeInvites({ list: 'L' })],
        ['setAdmin', () => repo.setAdmin({ email: 'a@ug.uchile.cl', admin: true })],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });

  it('reports', async () => {
    const { client, calls } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'admin_report_queue') return { body: { open: [], resolved: [], blocked: [] } };
      if (fn === 'admin_resolve_reports') return { body: { resolved: 2 } };
      if (fn === 'my_reports') return { body: [] };
      return { body: null };
    });
    const repo = supabaseReportsRepository(client);
    const report = {
      kind: 'card',
      id: 'g1/0',
      code: null,
      version: 1,
      category: 'error',
      comment: 'x',
      location: {},
    } as unknown as Parameters<typeof repo.send>[0];
    const resolve = {
      kind: 'card',
      targetId: 'g1/0',
      status: 'fixed',
      note: null,
      fixedVersion: 2,
    } as unknown as Parameters<typeof repo.resolve>[0];
    const out = await run(
      [
        ['send', () => repo.send(report)],
        ['mine', () => repo.mine()],
        ['queue', () => repo.queue()],
        ['resolve', () => repo.resolve(resolve)],
        ['reopen', () => repo.reopen('r1')],
        ['setBlocked', () => repo.setBlocked('u1', true)],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });

  it('account, with the download by fetch', async () => {
    const { client, calls, fetch } = recorder((c) => {
      const fn = rpcName(c);
      if (fn === 'resume_account') return { body: { accepted: null, deletion_cancelled: false } };
      if (fn === 'accept_legal') return { body: { accepted_at: '2026-11-10T07:00:00Z' } };
      if (fn === 'request_account_deletion') return { body: { delete_after: '2026-12-10' } };
      return { body: {} };
    });
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(client.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'user-token' } },
      error: null,
    } as unknown as Awaited<ReturnType<typeof client.auth.getSession>>);
    const repo = supabaseAccountRepository(client, { url: `${URL_}/`, key: KEY });
    const versions = { terms: 't1', privacy: 'p1' };
    const out = await run(
      [
        ['resume', () => repo.resume(versions)],
        ['accept', () => repo.accept(versions)],
        ['exportData', () => repo.exportData()],
        ['requestDeletion', () => repo.requestDeletion('a@ug.uchile.cl')],
      ],
      calls,
    );
    expect(out).toMatchSnapshot();
  });
});
