// The administrators and invitations domain, its limits and error, and how an email is normalized.

export interface AccessInvite {
  email: string;
  list: string;
  note: string | null;
  invitedBy: string | null;
  invitedAt: string;
  admin: boolean;
  hasAccount: boolean;
  lastSignInAt: string | null;
}

export interface AccessReport {
  /** Only read here: removing an invitation does not take away access. */
  openToDomain: boolean;
  lists: { list: string; invited: number; withAccount: number }[];
  invited: AccessInvite[];
  accountsWithoutInvite: { email: string; createdAt: string; lastSignInAt: string | null }[];
  /** Never removed as an administrator; null until the row is marked. */
  owner: string | null;
  youAreOwner: boolean;
}

/** `changed` is false when it already was as asked. */
export interface SetAdminResult {
  email: string;
  admin: boolean;
  changed: boolean;
}

export type InviteRejection = 'domain' | 'invalid' | 'repeated' | 'empty';

export interface InviteResult {
  added: string[];
  already: string[];
  rejected: { email: string; reason: InviteRejection }[];
}

export interface RemoveResult {
  removed: string[];
  notInvited: string[];
  keptAdmins: string[];
  sessionsClosed: number;
  openToDomain: boolean;
}

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
