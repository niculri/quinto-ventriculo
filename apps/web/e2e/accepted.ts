// The e2e server's port and the stored states of a demo account that already accepted the terms in force.
import { LEGAL_VERSIONS } from '@qv/schema';

export const PORT = 5174;

/** Every test starts with it, so that the popup on entering is only e2e/account.spec.ts's. */
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

export const ONLY_ACCEPTED = {
  cookies: [],
  origins: [{ origin: `http://localhost:${PORT}`, localStorage: [ACCEPTED_ACCOUNT] }],
};
