// The administrators and invitations domain, its limits and error, and how an email is normalized.

export type {
  AccessInvite,
  AccessReport,
  InviteRejection,
  InviteResult,
  RemoveResult,
  SetAdminResult,
} from '@qv/schema/user';

export const MAX_EMAILS = 500;

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

// Lowercase and without any space, also the invisible ones a paste brings, as invite_emails() does; for the demo and
// for counting what the form will send.
export const normalizeEmail = (raw: string) =>
  raw.replace(/(?:[\s\u00a0\u2007\u202f\u200b\u200c\u2060\ufeff]|\u200d)+/g, '').toLowerCase();
