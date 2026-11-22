// The codes of the API's error answers.
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors';

describe('ErrorCode', () => {
  it('every code is lowercase words joined by underscores, which the web compares with as written', () => {
    for (const code of ErrorCode.options) expect(code).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
  });

  it('knows the code of an error and refuses one that is not', () => {
    expect(ErrorCode.safeParse('not_found').success).toBe(true);
    expect(ErrorCode.safeParse('NotFound').success).toBe(false);
    expect(ErrorCode.safeParse('').success).toBe(false);
  });

  it('every refusal of the release has a code of its own, with the reasons the publishing function raises', () => {
    const release = ErrorCode.options.filter((c) => c.startsWith('release_'));
    expect(release).toContain('release_blocked');
    expect(release).toContain('release_not_last');
    expect(new Set(release).size).toBe(release.length);
  });
});
