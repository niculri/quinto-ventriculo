// A round's origin is written twice (@qv/quiz is a leaf package and cannot take it from @qv/schema): both lists agree.
import { ROUND_ORIGINS } from '@qv/quiz';
import type { RoundOrigin } from '@qv/quiz';
import { RoundOrigin as RoundOriginSchema } from '@qv/schema/user';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { RoundInfo } from '../model';

describe('the origin of a round', () => {
  it('is the same in @qv/quiz and in the saved progress', () => {
    expect([...RoundOriginSchema.options].sort()).toEqual([...ROUND_ORIGINS].sort());
    expectTypeOf<RoundInfo['origin']>().toEqualTypeOf<RoundOrigin>();
  });
});
