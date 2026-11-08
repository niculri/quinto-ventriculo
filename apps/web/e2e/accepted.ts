import { LEGAL_VERSIONS } from '@qv/schema';

/** The port of the e2e server (playwright.config.ts). */
export const PORT = 5174;

/**
 * The demo account with the terms and the privacy policy in force already accepted (step 2.3): every test starts
 * with it, so that the popup on entering is only e2e/account.spec.ts's.
 */
export const ACCEPTED_ACCOUNT = {
  name: 'qv-demo-account',
  value: JSON.stringify({
    accepted: {
      terms: LEGAL_VERSIONS.terms.version,
      privacy: LEGAL_VERSIONS.privacy.version,
      acceptedAt: '2026-11-08T12:00:00.000Z',
    },
    deletion: null,
  }),
};

/** A student who just arrived, but who already accepted the terms (the tests of the simple mode and the exam). */
export const ONLY_ACCEPTED = {
  cookies: [],
  origins: [{ origin: `http://localhost:${PORT}`, localStorage: [ACCEPTED_ACCOUNT] }],
};
