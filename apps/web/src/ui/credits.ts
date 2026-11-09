/** Who makes the site: its creator and developer (step 2.7, /about). */
export const AUTHOR = 'Nico Ulriksen';

/** Author credit shown in the footer of every page (requested by the author, 2026-10-31). */
export const CREDITS = `Creado por ${AUTHOR} · 2026`;

/**
 * The site's source code (step 2.4): its license (AGPL-3.0-or-later, section 13) asks to offer it to whoever uses the
 * site, so every footer links to it.
 */
export const SOURCE_CODE_URL = 'https://github.com/niculri/quinto-ventriculo';

/** The copyright notice of the code, for /licenses («Appropriate Legal Notices», AGPL section 5 d). */
export const COPYRIGHT = `© 2026 ${AUTHOR}`;

/**
 * The creator's picture on /about, or '' when this build has none. It is not in this repository: the build takes it
 * from the private one when it is there (`build/creator-photo.ts`); without it (the CI, the demo, the tests) /about
 * shows the initials in a circle of the same size.
 */
export const creatorPhoto = (): string => import.meta.env.VITE_CREATOR_PHOTO ?? '';
