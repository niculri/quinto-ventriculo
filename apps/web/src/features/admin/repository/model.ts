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

export { normalizeEmail } from '../../../shared/lib/email';
