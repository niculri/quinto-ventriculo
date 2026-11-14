// The account domain: accepted versions, the state on entering, and its error with the messages it shows.

export interface AcceptedVersions {
  terms: string;
  privacy: string;
  acceptedAt: string;
}

export interface AccountState {
  accepted: AcceptedVersions | null;
  deletionCancelled: boolean;
}

export type AccountErrorCode = 'session_closed' | 'email_mismatch' | 'admin_account' | 'unknown';

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

export const MESSAGES: Record<AccountErrorCode, string> = {
  session_closed: 'Tu sesión se cerró. Sal y vuelve a entrar con tu cuenta @ug.uchile.cl.',
  email_mismatch: 'Ese no es el correo de tu cuenta.',
  admin_account:
    'Eres administrador del sitio: para eliminar tu cuenta, primero hay que sacarte de los administradores.',
  unknown: 'No se pudo hacer. Revisa tu conexión e intenta de nuevo.',
};
