// The users and content databases' refusals, read from PostgREST's error ({ code, message, details, hint }) into a
// typed error: the one place that knows how the SQL raises each of them.

/**
 * The SQLSTATEs the SQL raises with (invalid parameter, session closed, not allowed, raised, no data, stale, refused),
 * and PostgREST's own code for a function the database does not have.
 */
export type SqlState =
  '22023' | '28000' | '42501' | 'P0001' | 'P0002' | 'P0409' | 'P0422' | 'PGRST202';

/**
 * Each reason the code tells apart, with the text of the message that carries it. The SQL raises
 * `raise exception '<reason>' using errcode = '<SQLSTATE>'`, and the SQLSTATE is shared by several reasons (P0001 is
 * card_changed, quota_exceeded and the report limits; 42501 is not_allowed, owner_only and admin_account): only the
 * message, the reason itself or `<function>: <reason>`, tells them apart.
 */
const REASON_TEXT = {
  card_changed: 'card_changed',
  quota_exceeded: 'quota_exceeded',
  session_closed: 'session_closed',
  email_mismatch: 'email_mismatch',
  admin_account: 'admin_account',
  owner_only: 'owner_only',
  owner_stays: 'owner_stays',
  not_invited: 'not_invited',
  admin_only: 'admin_only',
  admin_stays: 'admin_stays',
  report_daily_limit: 'report_daily_limit',
  report_place_limit: 'report_place_limit',
  report_blocked: 'report_blocked',
  nothing_open: 'nothing_open',
  nothing_to_reopen: 'nothing_to_reopen',
  // Refusals of invite_emails() and remove_invites() that only differ in their sentence (all 22023).
  too_many_emails: 'at most 500',
  list_required: '"list" is required',
  note_too_long: '"note" has at most',
} as const;
export type DbReason = keyof typeof REASON_TEXT;

export interface DbErrorLike {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class DatabaseError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(e: DbErrorLike) {
    super(e.message);
    this.name = 'DatabaseError';
    this.code = e.code ?? null;
    this.details = e.details ?? null;
    this.hint = e.hint ?? null;
  }

  /** The message carries this reason (as a part, as the SQL may prefix it with its function). */
  says(reason: DbReason): boolean {
    return this.message.includes(REASON_TEXT[reason]);
  }

  hasCode(...codes: SqlState[]): boolean {
    return this.code !== null && (codes as string[]).includes(this.code);
  }

  /** The reason of a `<fn>: <reason>` refusal (the content database's release functions), or null. */
  refusal(fn: string): string | null {
    return new RegExp(`^${fn}: ([a-z_]+)$`).exec(this.message)?.[1] ?? null;
  }
}

export const databaseError = (e: DbErrorLike): DatabaseError =>
  e instanceof DatabaseError ? e : new DatabaseError(e);
