import { ACCOUNT_DELETION_DAYS, ALLOWED_DOMAIN, CONTACT_EMAIL } from '@qv/schema';

export const DOMAIN_NOTICE =
  'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl. Entra con tu cuenta de la U.';
export const GOOGLE_NOTICE = 'No se pudo entrar con Google. Intenta de nuevo.';
export const DELETION_NOTICE = `Pediste eliminar tu cuenta: se cerraron tus sesiones y se borrará en ${ACCOUNT_DELETION_DAYS} días. Si vuelves a entrar antes, se cancela.`;
export const INVITE_NOTICE = `El Quinto Ventrículo está en prueba y por ahora solo entran personas invitadas. Si deberías tener acceso, escribe a ${CONTACT_EMAIL}.`;

/**
 * Notices the landing page can show from the URL (`/?notice=<code>`). Only codes: text in the URL would be
 * shown as is on the official page («escribe tu clave a…»), and that can be used to deceive.
 */
const NOTICES = {
  domain: DOMAIN_NOTICE,
  invite: INVITE_NOTICE,
  google: GOOGLE_NOTICE,
  deletion: DELETION_NOTICE,
} as const;
export type NoticeCode = keyof typeof NOTICES;

/** The title over the notice: every one is «No se pudo entrar» but the deletion's (step 2.3). */
export function noticeTitle(code: string | null): string {
  return code === 'deletion' ? 'Tu cuenta se eliminará' : 'No se pudo entrar';
}

export function noticeText(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(NOTICES, code) ? NOTICES[code as NoticeCode] : GOOGLE_NOTICE;
}

/**
 * The error Supabase comes back with → notice code. The hook (db/users …_invite_lists.sql) rejects an uninvited
 * account with «solo entran cuentas invitadas… escribe a contacto@quintoventriculo.cl» and another domain with «solo
 * para cuentas @ug.uchile.cl». The invitation is checked first: its message names another domain (the contact's).
 */
export function noticeCodeForError(description: string): NoticeCode {
  const text = description.toLowerCase();
  if (text.includes('invitad')) return 'invite';
  return text.includes(ALLOWED_DOMAIN) ? 'domain' : 'google';
}
