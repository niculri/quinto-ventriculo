import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from './domain';

describe('isAllowedEmail', () => {
  it.each(['nico@ug.uchile.cl', 'NICO@UG.UCHILE.CL', '  a.b@ug.uchile.cl '])('accepts %s', (c) => {
    expect(isAllowedEmail(c)).toBe(true);
  });

  it.each([
    'nico@gmail.com',
    'nico@uchile.cl',
    'nico@med.uchile.cl',
    'nico@ug.uchile.cl.evil.com',
    'nico@evilug.uchile.cl',
    'nico@x.ug.uchile.cl',
    'a@b@ug.uchile.cl',
    '@ug.uchile.cl',
    '',
    null,
    undefined,
  ])('rejects %s', (c) => {
    expect(isAllowedEmail(c)).toBe(false);
  });
});

describe('deckSlug', () => {
  it('readable, without accents or symbols', async () => {
    const { deckSlug } = await import('./flashcards');
    expect(deckSlug('01 - Columna vertebral')).toBe('01-columna-vertebral');
    expect(deckSlug('S3 · Músculos del dorso (Extras)')).toBe('s3-musculos-del-dorso-extras');
    expect(deckSlug('()')).toBe('mazo');
  });
});
