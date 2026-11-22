// Whether a session is still invited. Only `allowed`, `denied` and `signed_out` are remembered by the adapter:
// accepting the terms or a failure counts at once.
type Access = 'allowed' | 'denied' | 'signed_out' | 'not_accepted' | 'expired' | 'unknown';

export interface AccessChecker {
  check(token: string): Promise<Access>;
}

/** For a Worker without the users' publishable key: it fails closed. */
export const ACCESS_UNAVAILABLE: AccessChecker = {
  check: () => {
    console.error('USERS_SUPABASE_PUBLISHABLE_KEY is missing: no session can be checked');
    return Promise.resolve('unknown');
  },
};
