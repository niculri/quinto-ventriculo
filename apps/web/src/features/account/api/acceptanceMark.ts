// The mark that tells public/error-report.js this browser's account accepted the privacy policy in force: only then
// does a page failure carry the account.

import { LEGAL_VERSIONS } from '@qv/schema';
import { storageKeys } from '../../../shared/lib/storage';

const KEY = storageKeys.privacyAccepted;

/** With the version and the account: a new version, or another account in this browser, does not match it. */
export function markAccepted(userId: string) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ privacy: LEGAL_VERSIONS.privacy.version, user: userId }),
    );
  } catch {
    // blocked storage: the reports go without the account
  }
}

export function forgetAcceptance() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // blocked storage: there is no mark to remove
  }
}
