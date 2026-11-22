// Tests the notices after a failed sign-in: only known codes show their text, and which code a Supabase error is.
import { ALLOWED_DOMAIN } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import {
  DOMAIN_NOTICE,
  GOOGLE_NOTICE,
  INVITE_NOTICE,
  noticeCodeForError,
  noticeText,
  noticeTitle,
} from '../notices';

describe('noticeCodeForError', () => {
  it.each([
    ['User not invitado: pide una invitación', 'invite'],
    [`Solo personas invitadas de ${ALLOWED_DOMAIN}`, 'invite'],
    [`Solo cuentas @${ALLOWED_DOMAIN.toUpperCase()}`, 'domain'],
    ['Something went wrong with Google', 'google'],
  ])('«%s» → %s', (description, code) => {
    expect(noticeCodeForError(description)).toBe(code);
  });
});

describe('noticeText and noticeTitle', () => {
  it('a known code shows its text; an unknown one, Google’s, never the code itself; none, nothing', () => {
    expect(noticeText('domain')).toBe(DOMAIN_NOTICE);
    expect(noticeText('invite')).toBe(INVITE_NOTICE);
    expect(noticeText('<script>')).toBe(GOOGLE_NOTICE);
    expect(noticeText('toString')).toBe(GOOGLE_NOTICE);
    expect(noticeText(null)).toBeNull();
    expect(noticeText('')).toBeNull();
  });

  it('only a deletion has its own title', () => {
    expect(noticeTitle('deletion')).not.toBe(noticeTitle('domain'));
    expect(noticeTitle('domain')).toBe(noticeTitle(null));
  });
});
