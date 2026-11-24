// The e2e server's port and the stored states of a demo account that already accepted the terms in force.
import { LEGAL_VERSIONS } from '@qv/schema';

export const PORT = 5174;

/** A second demo server, for the spec that changes what everybody sees on it (a course turned off). */
export const OWN_SERVER_PORT = 5175;

/** And a third, for the spec of the admin mode, which also changes the settings. */
export const ADMIN_MODE_PORT = 5176;

/** And a fourth, for the spec that publishes and undoes: what everybody on it reads changes. */
export const FRESH_PORT = 5177;

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

/**
 * What every test starts with in a server at `port`: the advanced mode (the four buttons, the limits and the presets)
 * and the week of the test content turned on, with the terms and the privacy policy in force accepted.
 */
export const demoState = (port: number) => ({
  cookies: [],
  origins: [
    {
      origin: `http://localhost:${port}`,
      localStorage: [
        {
          name: 'qv-demo-study',
          value: JSON.stringify({
            preferences: { fullAnki: true, fourButtons: true, welcomeSeen: true },
            activations: [{ deckId: '1006809718735317183', active: true }],
          }),
        },
        ACCEPTED_ACCOUNT,
      ],
    },
  ],
});
