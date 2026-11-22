// Tests for the refusals of publishing and undoing as the panel gets them: status, code and message.
import { describe, expect, it } from 'vitest';
import { publishRefusal, revertRefusal } from '../releases';

describe('publishRefusal', () => {
  it('a reason it knows has its own status and code', () => {
    expect(publishRefusal('fingerprint', null)).toMatchObject({
      status: 409,
      body: { error: 'release_changed' },
    });
    expect(publishRefusal('marks', null)).toMatchObject({ status: 422 });
  });

  it('a reason it does not know is a 400 that is not specific, never a crash', () => {
    expect(publishRefusal('algo_nuevo', 'x')).toMatchObject({
      status: 400,
      body: { error: 'invalid_release', message: 'Esa publicación no es válida.' },
    });
  });

  it('only the refusals that name something show the detail, cut at 500 characters', () => {
    const detail = 'x'.repeat(600);
    const named = publishRefusal('unpublished', detail).body.message;
    expect(named.endsWith(`Detalle: ${'x'.repeat(500)}`)).toBe(true);
    expect(publishRefusal('unpublished', null).body.message).not.toContain('Detalle');
    expect(publishRefusal('marks', detail).body.message).not.toContain('Detalle');
  });
});

describe('revertRefusal', () => {
  it('a reason it knows, with its detail only when it names something', () => {
    expect(revertRefusal('not_last', 'x').body.message).not.toContain('Detalle');
    expect(revertRefusal('public_changed', 'nota X').body.message).toContain('Detalle: nota X');
  });

  it('a reason it does not know says that the release does not exist, which is not what publishing says', () => {
    const r = revertRefusal('algo_nuevo', null);
    expect(r).toMatchObject({ status: 400, body: { message: 'Esa publicación no existe.' } });
    expect(r.body.message).not.toBe(publishRefusal('algo_nuevo', null).body.message);
  });
});
