// Tests for the access gate of a session: what each answer of the access checker becomes, and that nothing else opens it.
import { describe, expect, it } from 'vitest';
import { memoryRepository } from '../../adapters/memory/content';
import { createApp } from '../../app';
import type { Access } from '../../ports/access';
import { MediaSigner } from '../../services/media-signer';

const EMPTY = {
  semesters: [],
  courses: [],
  assessments: [],
  notes: [],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

/** A checker that answers `answer`, which the port may not even know: a value that comes from a JSON text. */
const answering = (answer: string) => ({
  check: () => Promise.resolve(JSON.parse(JSON.stringify(answer)) as Access),
});

const get = (answer: string) =>
  createApp({
    verifier: { verify: () => Promise.resolve({ id: 'u', email: 'ana@ug.uchile.cl' }) },
    repository: memoryRepository(EMPTY),
    media: { get: () => Promise.resolve(null) },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    access: answering(answer),
  }).request('/api/catalog', { headers: { Authorization: 'Bearer t' } });

describe('the access gate', () => {
  it('each answer of the checker has its status and code, and none is kept by the browser', async () => {
    const expected: [string, number, string | null][] = [
      ['allowed', 200, null],
      ['expired', 401, 'unauthenticated'],
      ['signed_out', 401, 'unauthenticated'],
      ['not_accepted', 403, 'terms_not_accepted'],
      ['denied', 403, 'not_invited'],
      ['unknown', 503, 'access_unavailable'],
    ];
    for (const [answer, status, code] of expected) {
      const r = await get(answer);
      expect(r.status, answer).toBe(status);
      if (code) {
        expect((await r.json<{ error: string }>()).error, answer).toBe(code);
        expect(r.headers.get('Cache-Control'), answer).toBe('no-store');
      }
    }
  });

  it('an answer the port does not have is a 503, as «unknown»: the gate fails closed', async () => {
    for (const answer of ['maybe', 'ALLOWED', '', 'toString', '__proto__']) {
      const r = await get(answer);
      expect(r.status, answer).toBe(503);
      expect((await r.json<{ error: string }>()).error, answer).toBe('access_unavailable');
      expect(r.headers.get('Cache-Control'), answer).toBe('no-store');
    }
  });
});
