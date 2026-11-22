// Tests for unwrap: the data of an answer, or an error that says which read failed.
import { describe, expect, it } from 'vitest';
import { unwrap } from '../unwrap';

describe('unwrap', () => {
  it('gives the data as it is, also when it is null (a read that found nothing)', () => {
    expect(unwrap({ data: [1], error: null }, 'x')).toEqual([1]);
    expect(unwrap({ data: null as string | null, error: null }, 'x')).toBeNull();
  });

  it('an error names what was read and carries the database message', () => {
    expect(() => unwrap({ data: null, error: { message: 'boom' } }, 'courses')).toThrow(
      'Content database (courses): boom',
    );
  });
});
