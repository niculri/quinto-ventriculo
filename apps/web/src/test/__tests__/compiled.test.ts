// Tests that the tests run compiled code when they should: if the compiler stopped being applied in Vitest, the
// assertions that only hold with it would be skipped without anybody noticing.
import { describe, expect, it } from 'vitest';
import { compiled } from '../compiled';

describe('the compiled probe', () => {
  it('says the compiler is on exactly when the run is not the coverage one', () => {
    expect(compiled).toBe(process.env.QV_COMPILED === '1');
  });
});
