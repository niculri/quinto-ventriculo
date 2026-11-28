// The legal texts' versions in force and the account retention terms.

// Changing the text of /terms or /privacy means a new version here, and everybody is asked again. A number, or two
// joined by a dot: the database takes nothing else.
export const LEGAL_VERSIONS = {
  terms: { version: '3', date: '2026-11-08' },
  privacy: { version: '5', date: '2026-11-27' },
} as const;

export const ACCOUNT_DELETION_DAYS = 7;

export const INACTIVE_ACCOUNT_MONTHS = 36;

export const DATA_CONTROLLER = 'Nico Ulriksen';
