// Who makes the site: the author's credit, the link to the source code and the copyright notice, and the creator's
// picture of this build.
export const AUTHOR = 'Nico Ulriksen';

export const CREDITS = `Creado por ${AUTHOR} · 2026`;

/** Its license (AGPL-3.0-or-later, section 13) asks to offer the source to whoever uses the site: every footer does. */
export const SOURCE_CODE_URL = 'https://github.com/niculri/quinto-ventriculo';

/** The copyright notice of the code, for /licenses («Appropriate Legal Notices», AGPL section 5 d). */
export const COPYRIGHT = `© 2026 ${AUTHOR}`;

export const creatorPhoto = (): string => import.meta.env.VITE_CREATOR_PHOTO ?? '';
