// Google's sign-in button (Google Identity Services): the port the landing page uses, and the loader of Google's script.
import { ALLOWED_DOMAIN } from '@qv/schema';

export interface GoogleButtonStyle {
  size: 'large' | 'medium';
  text: 'signin_with' | 'signin';
  width: number;
}

export interface GoogleIdentity {
  /** The next account chosen with a button comes back to `onCredential` as an ID token that carries `hashedNonce`. */
  start(hashedNonce: string, onCredential: (idToken: string) => void): void;
  renderButton(parent: HTMLElement, style: GoogleButtonStyle): void;
}

/** Resolves once Google's button can be drawn; rejects when it cannot load (blocked, offline, slow). */
export type GoogleIdentityLoader = () => Promise<GoogleIdentity>;

interface GsiId {
  initialize(config: Record<string, unknown>): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

export const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const LOCALE = 'es-419';
const LOAD_TIMEOUT_MS = 8000;

function wrap(id: GsiId, clientId: string): GoogleIdentity {
  return {
    start(hashedNonce, onCredential) {
      id.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        // Shows only accounts of the domain; who enters is decided by the users' database.
        hd: ALLOWED_DOMAIN,
        ux_mode: 'popup',
        auto_select: false,
        callback: (r: { credential?: unknown }) => {
          if (typeof r.credential === 'string') onCredential(r.credential);
        },
      });
    },
    renderButton(parent, style) {
      parent.replaceChildren();
      id.renderButton(parent, {
        type: 'standard',
        theme: 'outline',
        shape: 'rectangular',
        logo_alignment: 'left',
        locale: LOCALE,
        ...style,
      });
    },
  };
}

/**
 * Adds Google's script once, when the landing page first asks. A web app added to the iPhone's home screen gets
 * nothing back from Google's popup, so there the redirect sign-in is used instead.
 */
export function gisLoader(clientId: string, timeoutMs = LOAD_TIMEOUT_MS): GoogleIdentityLoader {
  let loading: Promise<GoogleIdentity> | null = null;
  const load = () =>
    new Promise<GoogleIdentity>((resolve, reject) => {
      if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
        reject(new Error('standalone'));
        return;
      }
      const script = document.createElement('script');
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      const done = (error: Error | null) => {
        clearTimeout(timer);
        const id = window.google?.accounts?.id;
        if (error) reject(error);
        else if (id) resolve(wrap(id, clientId));
        else reject(new Error('no google.accounts.id'));
      };
      script.src = `${GIS_SCRIPT}?hl=${LOCALE}`;
      script.async = true;
      script.addEventListener('load', () => done(null));
      script.addEventListener('error', () => done(new Error('blocked')));
      document.head.append(script);
    });
  return () => (loading ??= load());
}
