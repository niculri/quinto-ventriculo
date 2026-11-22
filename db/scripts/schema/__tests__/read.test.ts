// withoutSecrets keeps the connection string and its password out of what psql says when it fails.
import { describe, expect, it } from 'vitest';
import { withoutSecrets } from '../read';

const CONNECTION = 'postgresql://postgres.abc:p%40ss-word@aws-0.example.com:5432/postgres';

describe('withoutSecrets', () => {
  it('hides the whole connection string when psql repeats it', () => {
    const said = `psql: error: end of string reached in IPv6 host address in URI: "${CONNECTION}"`;
    expect(withoutSecrets(said, CONNECTION)).toBe(
      'psql: error: end of string reached in IPv6 host address in URI: "<connection string>"',
    );
  });

  it('hides the password, written as in the URI or decoded, when only a piece is repeated', () => {
    expect(withoutSecrets('failed for "p%40ss-word" and "p@ss-word"', CONNECTION)).toBe(
      'failed for "***" and "***"',
    );
  });

  it('leaves a message without secrets as it is, also for a string that is not a URI', () => {
    const said =
      'psql: error: connection to server at "127.0.0.1", port 1 failed: Connection refused';
    expect(withoutSecrets(said, CONNECTION)).toBe(said);
    expect(withoutSecrets(said, 'not a url')).toBe(said);
  });
});
