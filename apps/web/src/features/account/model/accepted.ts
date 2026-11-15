// Whether the account accepted the terms and the privacy policy in force.
import { LEGAL_VERSIONS } from '@qv/schema';
import type { AccountState } from '@qv/schema/user';

export const acceptedNow = (state: AccountState | undefined) =>
  state?.accepted?.terms === LEGAL_VERSIONS.terms.version &&
  state.accepted.privacy === LEGAL_VERSIONS.privacy.version;
