// Notices the landing page shows after a failed or cancelled sign-in, by code, and the mapping from Supabase errors.
import { ALLOWED_DOMAIN } from '@qv/schema';
import { sessionStrings } from '../strings';

export const DOMAIN_NOTICE = sessionStrings.notices.domain;
export const GOOGLE_NOTICE = sessionStrings.notices.google;
const DELETION_NOTICE = sessionStrings.notices.deletion;
export const INVITE_NOTICE = sessionStrings.notices.invite;

// Only codes go in the URL (`/?notice=<code>`): free text there would be shown as is on the site and could deceive.
const NOTICES = {
  domain: DOMAIN_NOTICE,
  invite: INVITE_NOTICE,
  google: GOOGLE_NOTICE,
  deletion: DELETION_NOTICE,
} as const;
export type NoticeCode = keyof typeof NOTICES;

export function noticeTitle(code: string | null): string {
  return code === 'deletion' ? sessionStrings.titles.deletion : sessionStrings.titles.failed;
}

export function noticeText(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(NOTICES, code) ? NOTICES[code as NoticeCode] : GOOGLE_NOTICE;
}

// The invitation goes first: its message also names a domain (the contact's) and would read as the domain error.
export function noticeCodeForError(description: string): NoticeCode {
  const text = description.toLowerCase();
  if (text.includes('invitad')) return 'invite';
  return text.includes(ALLOWED_DOMAIN) ? 'domain' : 'google';
}
