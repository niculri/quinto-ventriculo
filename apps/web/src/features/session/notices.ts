// Notices the landing page shows after a failed or cancelled sign-in, by code, and the mapping from Supabase errors.
import { ACCOUNT_DELETION_DAYS, ALLOWED_DOMAIN, CONTACT_EMAIL } from '@qv/schema';

export const DOMAIN_NOTICE =
  'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl. Entra con tu cuenta de la U.';
export const GOOGLE_NOTICE = 'No se pudo entrar con Google. Intenta de nuevo.';
const DELETION_NOTICE = `Pediste eliminar tu cuenta: se cerraron tus sesiones y se borrará en ${ACCOUNT_DELETION_DAYS} días. Si vuelves a entrar antes, se cancela.`;
export const INVITE_NOTICE = `El Quinto Ventrículo está en prueba y por ahora solo entran personas invitadas. Si deberías tener acceso, escribe a ${CONTACT_EMAIL}.`;

// Only codes go in the URL (`/?notice=<code>`): free text there would be shown as is on the site and could deceive.
const NOTICES = {
  domain: DOMAIN_NOTICE,
  invite: INVITE_NOTICE,
  google: GOOGLE_NOTICE,
  deletion: DELETION_NOTICE,
} as const;
export type NoticeCode = keyof typeof NOTICES;

export function noticeTitle(code: string | null): string {
  return code === 'deletion' ? 'Tu cuenta se eliminará' : 'No se pudo entrar';
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
