// What the API takes from a request: each input is checked or normalized the same way every time, and what only
// normalizes never fails.
import { describe, expect, it } from 'vitest';
import {
  AcceptsGzip,
  BearerToken,
  CardChangesQuery,
  CardIndexParams,
  CardParams,
  ClientErrorBody,
  MediaKey,
  MediaQuery,
  PreviewRequest,
  PublishedSource,
  QuizzesQuery,
  ReleaseItemsQuery,
  ReleaseMarkRequest,
  ReleasePageQuery,
  SearchQuery,
  UsageOpenBody,
} from '../requests';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe('the headers', () => {
  it('a bearer token is the word «Bearer» in any case and a token without spaces', () => {
    expect(BearerToken.parse('Bearer abc.def')).toBe('abc.def');
    expect(BearerToken.parse('bearer   xyz')).toBe('xyz');
    for (const bad of ['', 'Bearer', 'Bearer a b', 'Token abc', ' Bearer abc', 'Bearerabc']) {
      expect(ok(BearerToken, bad)).toBe(false);
    }
  });

  it('only the value «draft» asks for the draft, and only «published» narrows it', () => {
    expect(ok(PreviewRequest, 'draft')).toBe(true);
    expect(ok(PreviewRequest, 'Draft')).toBe(false);
    expect(ok(PreviewRequest, '1')).toBe(false);
    expect(ok(PublishedSource, 'published')).toBe(true);
    expect(ok(PublishedSource, 'draft')).toBe(false);
  });

  it('gzip is accepted as a word, among other encodings, in any case', () => {
    expect(ok(AcceptsGzip, 'gzip, deflate, br')).toBe(true);
    expect(ok(AcceptsGzip, 'GZIP')).toBe(true);
    expect(ok(AcceptsGzip, 'br;q=1, gzip;q=0.5')).toBe(true);
    expect(ok(AcceptsGzip, 'gzipped')).toBe(false);
    expect(ok(AcceptsGzip, 'identity')).toBe(false);
  });
});

describe('SearchQuery', () => {
  it('trims the text and cuts it at 200 characters, and gives an empty text when there is none', () => {
    expect(SearchQuery.parse({ q: '  núcleo  ' }).q).toBe('núcleo');
    expect(SearchQuery.parse({ q: 'a'.repeat(250) }).q).toHaveLength(200);
    expect(SearchQuery.parse({}).q).toBe('');
  });

  it('the limit is a number from 1 to 50, 20 when it is missing or does not read', () => {
    const limit = (v?: string) => SearchQuery.parse(v === undefined ? {} : { limit: v }).limit;
    expect([
      limit(),
      limit('x'),
      limit('0'),
      limit('-3'),
      limit('7'),
      limit('50'),
      limit('51'),
      limit('1000'),
    ]).toEqual([20, 20, 20, 1, 7, 50, 50, 50]);
    expect(limit('12abc')).toBe(12);
  });
});

describe('what only has to be a filter', () => {
  it('the list of tests takes a course and an assessment, each optional', () => {
    expect(QuizzesQuery.parse({})).toEqual({});
    expect(QuizzesQuery.parse({ course: 'a', assessment: 'a/b' })).toEqual({
      course: 'a',
      assessment: 'a/b',
    });
  });
});

describe('the parameters of a path', () => {
  const HASH = 'f'.repeat(32);

  it('a card index is a course, an assessment and a hash, each in lowercase', () => {
    expect(ok(CardIndexParams, { course: 'bc', assessment: 'certamen-2', hash: HASH })).toBe(true);
    for (const bad of [
      { course: 'B' },
      { course: '' },
      { course: 'a'.repeat(81) },
      { assessment: 'a/b' },
      { hash: 'F'.repeat(32) },
      { hash: 'f'.repeat(31) },
    ]) {
      expect(ok(CardIndexParams, { course: 'bc', assessment: 'c', hash: HASH, ...bad })).toBe(
        false,
      );
    }
    expect(ok(CardIndexParams, { course: 'a'.repeat(80), assessment: 'c', hash: HASH })).toBe(true);
  });

  it('the changes ask since up to 15 digits, with no sign or decimals', () => {
    expect(ok(CardChangesQuery, { since: '0' })).toBe(true);
    expect(ok(CardChangesQuery, { since: '9'.repeat(15) })).toBe(true);
    for (const bad of ['', '-1', '1.5', '9'.repeat(16), 'x', ' 1'])
      expect(ok(CardChangesQuery, { since: bad })).toBe(false);
    expect(ok(CardChangesQuery, {})).toBe(false);
  });

  it('a card is a guid of printable characters and an ord of up to four digits', () => {
    expect(ok(CardParams, { noteGuid: 'a/b%c&d', ord: '12' })).toBe(true);
    expect(ok(CardParams, { noteGuid: 'g', ord: '9999' })).toBe(true);
    for (const bad of [
      { noteGuid: '' },
      { noteGuid: 'a b' },
      { noteGuid: 'a'.repeat(65) },
      { ord: '10000' },
      { ord: '' },
      { ord: '-1' },
      { ord: '1.0' },
    ]) {
      expect(ok(CardParams, { noteGuid: 'g', ord: '0', ...bad })).toBe(false);
    }
  });
});

describe('the bodies that are read as text', () => {
  it('a usage opening is JSON of at most 512 characters, of the shapes the panel knows', () => {
    expect(UsageOpenBody.parse('{"kind":"note","id":"traduccion"}')).toEqual({
      kind: 'note',
      id: 'traduccion',
    });
    expect(UsageOpenBody.parse('{"kind":"search","from":"home"}')).toEqual({
      kind: 'search',
      from: 'home',
    });
    expect(ok(UsageOpenBody, 'not json')).toBe(false);
    expect(ok(UsageOpenBody, '{"kind":"note","id":"x","extra":1}')).toBe(false);
    const padded = `{"kind":"note","id":"x"}${' '.repeat(512)}`;
    expect(ok(UsageOpenBody, padded)).toBe(false);
    const base = '{"kind":"note","id":"x"}';
    const exact = `${base}${' '.repeat(512 - base.length)}`;
    expect(exact.length).toBe(512);
    expect(ok(UsageOpenBody, exact)).toBe(true);
  });

  it('the length counts UTF-16 units, so an emoji weighs two', () => {
    const body = (n: number) => `{"kind":"search","from":"home","x":"${'😀'.repeat(n)}"}`;
    expect(ok(UsageOpenBody, body(300))).toBe(false);
    expect(body(300).length).toBeGreaterThan(512);
    expect(Array.from(body(300)).length).toBeLessThan(512);
  });

  it('a client error is JSON of at most 1,024 characters, a path without query, a short message and a version', () => {
    const report = { kind: 'chunk', page: '/notes/x', message: 'failed', version: 'abc-123' };
    expect(ClientErrorBody.parse(JSON.stringify(report))).toEqual(report);
    expect(ok(ClientErrorBody, JSON.stringify({ ...report, page: '/notes/x?q=1' }))).toBe(false);
    expect(ok(ClientErrorBody, JSON.stringify({ ...report, page: 'notes' }))).toBe(false);
    expect(ok(ClientErrorBody, JSON.stringify({ ...report, version: 'a b' }))).toBe(false);
    expect(ok(ClientErrorBody, JSON.stringify({ ...report, message: 'm'.repeat(301) }))).toBe(
      false,
    );
    expect(ok(ClientErrorBody, 'x'.repeat(1025))).toBe(false);
    expect(ok(ClientErrorBody, '{broken')).toBe(false);
    expect(ok(ClientErrorBody, JSON.stringify({ ...report, version: '' }))).toBe(true);
  });
});

describe('the release screens', () => {
  it('the items of an assessment are asked by kind and by «course/assessment», after a key of up to 200', () => {
    const q = { kind: 'card', assessment: 'bc/c2' };
    expect(ok(ReleaseItemsQuery, q)).toBe(true);
    expect(ok(ReleaseItemsQuery, { ...q, after: 'a'.repeat(200) })).toBe(true);
    expect(ok(ReleaseItemsQuery, { ...q, after: 'a'.repeat(201) })).toBe(false);
    expect(ok(ReleaseItemsQuery, { ...q, assessment: 'bc' })).toBe(false);
    expect(ok(ReleaseItemsQuery, { ...q, assessment: 'BC/c2' })).toBe(false);
    expect(ok(ReleaseItemsQuery, { ...q, kind: 'other' })).toBe(false);
  });

  it('a page is asked after a key of up to 300', () => {
    expect(ok(ReleasePageQuery, {})).toBe(true);
    expect(ok(ReleasePageQuery, { after: 'a'.repeat(300) })).toBe(true);
    expect(ok(ReleasePageQuery, { after: 'a'.repeat(301) })).toBe(false);
  });

  it('a mark needs the draft’s fingerprint, which mark and whether it is checked', () => {
    const mark = { fingerprint: 'a'.repeat(32), mark: 'phone', checked: true };
    expect(ok(ReleaseMarkRequest, mark)).toBe(true);
    expect(ok(ReleaseMarkRequest, { ...mark, fingerprint: 'a'.repeat(31) })).toBe(false);
    expect(ok(ReleaseMarkRequest, { ...mark, mark: 'other' })).toBe(false);
    expect(ok(ReleaseMarkRequest, { ...mark, checked: 'yes' })).toBe(false);
  });
});

describe('the images', () => {
  it('a key is lowercase folders and a file, with no «..»', () => {
    for (const key of ['cards/abc.webp', 'a/b/c.d_e-f.png', 'x/y'])
      expect(ok(MediaKey, key)).toBe(true);
    for (const bad of [
      '',
      'cards',
      '/cards/a',
      'Cards/a',
      'cards/A.webp',
      'cards//a',
      'cards/a b',
      'cards/../a',
      'cards/a..b',
      'cards/a/',
      '../a',
    ]) {
      expect(ok(MediaKey, bad)).toBe(false);
    }
  });

  it('the signature never fails: an expiry that is missing is NaN, and a missing signature is empty', () => {
    expect(MediaQuery.parse({ e: '123', s: 'abc', p: 'thumb' })).toEqual({
      e: 123,
      s: 'abc',
      p: 'thumb',
    });
    expect(MediaQuery.parse({})).toEqual({ e: Number.NaN, s: '' });
    expect(MediaQuery.parse({ e: 'x' }).e).toBeNaN();
  });
});
