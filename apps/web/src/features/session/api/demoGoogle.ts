// Google's button in the demo mode and the e2e tests: a plain button that hands back a test ID token with the nonce.
import type { GoogleIdentity, GoogleIdentityLoader } from './googleIdentity';
import { storageKeys } from '../../../shared/lib/storage';
import { DEMO_EMAIL } from './demo';
import { demoGoogleStrings as s } from './strings/demoGoogle.strings';

const base64url = (text: string) =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An unsigned JWT with what demoSessionService checks: the account and Google's copy of the nonce. */
export function demoIdToken(hashedNonce: string, email = DEMO_EMAIL): string {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iss: 'https://accounts.google.com', email, nonce: hashedNonce }),
  );
  return `${header}.${payload}.demo`;
}

/** `qv-demo-google` = `blocked` makes it fail to load, like a blocked script, for the redirect sign-in. */
export function demoGoogleIdentity(storage: Storage): GoogleIdentityLoader {
  return () => {
    if (storage.getItem(storageKeys.demo.google) === 'blocked') {
      return Promise.reject(new Error('blocked'));
    }
    let give: (() => void) | null = null;
    const google: GoogleIdentity = {
      start(hashedNonce, onCredential) {
        give = () => onCredential(demoIdToken(hashedNonce));
      },
      renderButton(parent, style) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.google = 'demo';
        button.textContent = style.text === 'signin' ? s.signin : s.signinWith;
        button.className =
          'h-full w-full rounded border border-border bg-surface px-3 text-sm font-medium text-ink';
        button.addEventListener('click', () => give?.());
        parent.replaceChildren(button);
      },
    };
    return Promise.resolve(google);
  };
}
