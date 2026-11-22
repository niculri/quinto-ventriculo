// The paths the web asks for: each value goes in its place as it comes, what needs encoding is encoded by the caller
// of the path and the query strings carry only what was asked.
import { describe, expect, it } from 'vitest';
import { API_PREFIX, API_ROUTES, apiPaths } from '../routes';

describe('apiPaths', () => {
  it('every path starts with the API prefix, and the ones without values are their pattern', () => {
    expect(apiPaths.thumbs()).toBe('/api/anki/thumbs');
    expect(apiPaths.siteSettings()).toBe('/api/admin/site-settings');
    expect(apiPaths.releaseLog()).toBe('/api/admin/releases');
    for (const path of [
      apiPaths.unpublished(),
      apiPaths.usageOpen(),
      apiPaths.clientError(),
      apiPaths.usage(),
      apiPaths.release(),
      apiPaths.releaseMarks(),
      apiPaths.publishRelease(),
      apiPaths.revertRelease(),
    ]) {
      expect(path.startsWith(`${API_PREFIX}/`)).toBe(true);
    }
  });

  it('the draft or the published version is a choice of the admin mode, in the query', () => {
    expect(apiPaths.catalog()).toBe('/api/catalog');
    expect(apiPaths.catalog(true)).toBe('/api/catalog?source=published');
    expect(apiPaths.deck('12')).toBe('/api/decks/12');
    expect(apiPaths.deck('12', true)).toBe('/api/decks/12?source=published');
    expect(apiPaths.card('g', 2, true)).toBe('/api/cards/g/2?source=published');
    expect(apiPaths.quiz('q', true)).toBe('/api/quizzes/q?source=published');
    expect(apiPaths.quizSection('q', 's', true)).toBe('/api/quizzes/q/sections/s?source=published');
  });

  it('what could break a segment is encoded: a card’s guid has slashes, percents and question marks', () => {
    expect(apiPaths.card('a/b%c?d', 0)).toBe('/api/cards/a%2Fb%25c%3Fd/0');
    expect(apiPaths.note('a b/ñ')).toBe('/api/notes/a%20b%2F%C3%B1');
    expect(apiPaths.deck('1/2')).toBe('/api/decks/1%2F2');
    expect(apiPaths.quizSection('a/b', 'c d')).toBe('/api/quizzes/a%2Fb/sections/c%20d');
  });

  it('a value that looks like a pattern of its own is not filled in again', () => {
    expect(apiPaths.quizSection(':sectionId', 'x')).toBe('/api/quizzes/%3AsectionId/sections/x');
    expect(apiPaths.note('$&')).toBe('/api/notes/%24%26');
  });

  it('the card index takes the assessment as two segments, as it is', () => {
    expect(apiPaths.cardIndex('biologia-celular/certamen-2', 'abc')).toBe(
      '/api/anki/index/biologia-celular/certamen-2/abc',
    );
  });

  it('a search carries its text and a limit, both encoded', () => {
    expect(apiPaths.search('núcleo & poro', 8)).toBe('/api/search?q=n%C3%BAcleo+%26+poro&limit=8');
  });

  it('the changes of the cards ask since a number', () => {
    expect(apiPaths.cardChanges(120)).toBe('/api/anki/card-changes?since=120');
  });

  it('the list of tests is filtered only by what is given', () => {
    expect(apiPaths.quizzes({})).toBe('/api/quizzes');
    expect(apiPaths.quizzes({ course: 'bc' })).toBe('/api/quizzes?course=bc');
    expect(apiPaths.quizzes({ course: 'bc', assessment: 'bc/c2' })).toBe(
      '/api/quizzes?course=bc&assessment=bc%2Fc2',
    );
  });

  it('the release lists continue after a key, and the first page has no «after»', () => {
    expect(apiPaths.releaseTexts(null)).toBe('/api/admin/release/texts');
    expect(apiPaths.releaseTexts('k 1')).toBe('/api/admin/release/texts?after=k+1');
    expect(apiPaths.releaseMedia(null)).toBe('/api/admin/release/media');
    expect(apiPaths.releaseMedia('cards/a.webp')).toBe(
      '/api/admin/release/media?after=cards%2Fa.webp',
    );
    expect(apiPaths.releaseItems('bc/c2', 'card', null)).toBe(
      '/api/admin/release/items?assessment=bc%2Fc2&kind=card',
    );
    expect(apiPaths.releaseItems('bc/c2', 'card', 'n')).toBe(
      '/api/admin/release/items?assessment=bc%2Fc2&kind=card&after=n',
    );
  });

  it('the image path keeps the key’s folders, without a signature', () => {
    expect(apiPaths.media('cards/abc.webp')).toBe('/api/media/cards/abc.webp');
  });
});

describe('API_ROUTES', () => {
  it('each route has one method and a pattern that starts with a slash', () => {
    for (const r of Object.values(API_ROUTES)) {
      expect(['GET', 'PUT', 'POST']).toContain(r.method);
      expect(r.pattern.startsWith('/')).toBe(true);
    }
  });

  it('no two routes are the same method and pattern', () => {
    const seen = Object.values(API_ROUTES).map((r) => `${r.method} ${r.pattern}`);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
