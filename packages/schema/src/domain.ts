/** The only access rule: institutional student accounts of the Universidad de Chile. */
export const ALLOWED_DOMAIN = 'ug.uchile.cl';

/**
 * Where to write to ask for access, report an error or ask for something to be taken off the site (Cloudflare Email
 * Routing forwards it: docs/configuracion.md → «Correo de contacto»). The users database's hook says it too.
 */
export const CONTACT_EMAIL = 'contacto@quintoventriculo.cl';

/** Does the email belong exactly to the allowed domain? (not to a subdomain or a look-alike). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf('@');
  if (at <= 0 || clean.indexOf('@') !== at) return false;
  return clean.slice(at + 1) === ALLOWED_DOMAIN;
}
