// What every port does when its part is not configured: what only reports does nothing, what reads or writes fails loudly.
import { describe, expect, it } from 'vitest';
import { NO_CLIENT_ERRORS, NO_CLIENT_ERRORS_READER } from '../clientErrors';
import { NO_CONTENT_VERSION } from '../contentVersion';
import { NO_DEEP_HEALTH } from '../health';
import { NO_RELEASES } from '../releases';
import { NO_SETTINGS_REPOSITORY } from '../settings';
import { NO_UNPUBLISHED } from '../unpublished';
import { NO_RATE_LIMIT } from '../rateLimit';
import { NO_USAGE_EVENTS, NO_USAGE_OPENS, NO_USAGE_STATS, NO_WORKER_REQUESTS } from '../usage';

describe('the parts that only report', () => {
  it('a point that nobody listens to is lost without an error, never held back', () => {
    expect(() => {
      NO_USAGE_EVENTS.record({ kind: 'note', path: '/x' });
      NO_CLIENT_ERRORS.record({ kind: 'boot', page: '/', message: 'm', version: 'v' });
    }).not.toThrow();
  });
});

describe('the limits', () => {
  it('without a limiter nothing is refused', async () => {
    expect(await NO_RATE_LIMIT.allow('ana')).toBe(true);
  });
});

describe('the parts that read or write', () => {
  it.each([
    ['opens', () => NO_USAGE_OPENS.read(), 'opens'],
    ['usage figures', () => NO_USAGE_STATS.stats('t', { decks: {}, quizzes: {} }), 'usage figures'],
    ['errors of the browsers', () => NO_CLIENT_ERRORS_READER.read(), 'errors'],
    ["the Worker's requests", () => NO_WORKER_REQUESTS.read(), 'Worker requests'],
    ['deep health', () => NO_DEEP_HEALTH.run(), 'deep health'],
    ['unpublished record', () => NO_UNPUBLISHED.log(), 'unpublished'],
    ['site settings (read)', () => NO_SETTINGS_REPOSITORY.get(), 'site settings'],
    ['site settings (write)', () => NO_SETTINGS_REPOSITORY.set({ by: 'x' }), 'site settings'],
    ['release summary', () => NO_RELEASES.summaryJson(), 'release'],
    ['release log', () => NO_RELEASES.log(), 'release'],
    ['release revert', () => NO_RELEASES.revert(1, 'x'), 'release'],
    ['content version', () => NO_CONTENT_VERSION.current(), 'content version'],
  ])('%s is rejected with a message that says what is missing', async (_name, call, word) => {
    await expect(call()).rejects.toThrow(new RegExp(`${word}.*not configured`, 'i'));
  });
});
