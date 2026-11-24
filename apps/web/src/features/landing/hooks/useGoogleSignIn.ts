// Google's own button on the landing page: loads it, arms it with a fresh nonce and signs in with the ID token it gives.
import { useEffect, useEffectEvent, useState } from 'react';
import { useGoogleIdentity } from '../../session/api/context';
import type { GoogleIdentity } from '../../session/api/googleIdentity';
import { useSession } from '../../session/context';
import { newNonce } from '../../session/model/nonce';

/**
 * `none`: this build has no Google button (redirect only); `failed`: it did not load, so the redirect takes its place;
 * `ready` draws it again on each `attempt`, since each one carries a new nonce.
 */
export type GoogleButtonState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; google: GoogleIdentity; attempt: number }
  | { status: 'entering' };

export function useGoogleSignIn(
  active: boolean,
  on: { start: () => void; failed: (error: unknown) => void },
): GoogleButtonState {
  const load = useGoogleIdentity();
  const { signInWithIdToken } = useSession();
  const [state, setState] = useState<GoogleButtonState>(() =>
    load ? { status: 'loading' } : { status: 'none' },
  );
  const enter = useEffectEvent((idToken: string, nonce: string) =>
    signInWithIdToken(idToken, nonce),
  );
  const started = useEffectEvent(() => on.start());
  const failed = useEffectEvent((error: unknown) => on.failed(error));

  useEffect(() => {
    if (!load || !active) return;
    let alive = true;
    let attempt = 0;
    async function arm(google: GoogleIdentity) {
      const nonce = await newNonce();
      if (!alive) return;
      google.start(nonce.hashed, (idToken) => void signInWith(google, idToken, nonce.raw));
      attempt += 1;
      setState({ status: 'ready', google, attempt });
    }
    // A nonce is used once: after a refusal, and after an account the site signs out, the button gets a new one.
    async function signInWith(google: GoogleIdentity, idToken: string, nonce: string) {
      setState({ status: 'entering' });
      started();
      try {
        await enter(idToken, nonce);
      } catch (error) {
        failed(error);
      }
      await arm(google);
    }
    load().then(arm, () => {
      if (alive) setState({ status: 'failed' });
    });
    return () => {
      alive = false;
    };
  }, [load, active]);

  return state;
}
