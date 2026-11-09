/**
 * The versions of the terms of use (/terms) and of the privacy policy (/privacy) in force (step 2.3, decision 43). They
 * are what a person accepts on entering, what the users' database records (`legal_acceptances`) and what the Worker
 * asks for before serving material (`access_status()`): changing the text of either page means a new version here,
 * with its date, and everybody is asked once again. A number, or two joined by a dot («2», «2.1»): the database
 * takes nothing else, and db/tests/account.test.ts accepts the ones in force.
 */
export const LEGAL_VERSIONS = {
  // Step 2.6: the reports of every content, their limits and the 12 months with the author's name.
  terms: { version: '3', date: '2026-11-08' },
  privacy: { version: '2', date: '2026-11-08' },
} as const;

/** Days between asking to delete the account and deleting it; signing in before that cancels it (decision 44). */
export const ACCOUNT_DELETION_DAYS = 7;

/** Months without signing in after which an account is deleted, with a notice first (decision 31). */
export const INACTIVE_ACCOUNT_MONTHS = 36;

/** The person who answers for the data (decisions 8 and 42), with CONTACT_EMAIL. */
export const DATA_CONTROLLER = 'Nico Ulriksen';
