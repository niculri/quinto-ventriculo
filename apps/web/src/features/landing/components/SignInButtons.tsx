// The sign-in buttons of the landing page: Google's own once it loads, ours (the redirect) while it loads or if it fails,
// each in a box of fixed size so that nothing moves when one takes the other's place.
import { LogIn } from 'lucide-react';
import type { GoogleButtonStyle, GoogleIdentity } from '../../session/api/googleIdentity';
import { button } from '../../../shared/ui/styles';
import type { GoogleButtonState } from '../hooks/useGoogleSignIn';
import { GoogleLogo } from './Art';
import { signInButtonsStrings as s } from './strings/SignInButtons.strings';

interface Props {
  google: GoogleButtonState;
  redirecting: boolean;
  onRedirect: () => void;
}

const HERO: GoogleButtonStyle = { size: 'large', text: 'signin_with', width: 260 };
const HEADER: GoogleButtonStyle = { size: 'medium', text: 'signin', width: 104 };

function GoogleSlot({ google, style }: { google: GoogleIdentity; style: GoogleButtonStyle }) {
  return (
    <div
      className={`flex size-full items-center ${style === HEADER ? 'justify-end' : 'justify-start'}`}
      ref={(el) => {
        if (el) google.renderButton(el, style);
      }}
    />
  );
}

/** While Google's button loads or its account is entering, ours stays in its place, disabled. */
const waiting = (google: GoogleButtonState) =>
  google.status === 'loading' || google.status === 'entering';

export function HeroSignIn({ google, redirecting, onRedirect }: Props) {
  const label = google.status === 'entering' ? s.entering : redirecting ? s.opening : s.signIn;
  return (
    <div className="flex h-12 w-[260px] items-center">
      {google.status === 'ready' ? (
        <GoogleSlot key={google.attempt} google={google.google} style={HERO} />
      ) : (
        <button
          type="button"
          onClick={onRedirect}
          disabled={redirecting || waiting(google)}
          className={`${button.base} ${button.primary} h-12 w-full px-6 text-base`}
        >
          <GoogleLogo /> {label}
        </button>
      )}
    </div>
  );
}

export function HeaderSignIn({ google, redirecting, onRedirect }: Props) {
  return (
    <div className="flex h-10 w-[104px] items-center justify-end">
      {google.status === 'ready' ? (
        <GoogleSlot key={google.attempt} google={google.google} style={HEADER} />
      ) : (
        <button
          type="button"
          onClick={onRedirect}
          disabled={redirecting || waiting(google)}
          className={`${button.base} ${button.ghost}`}
        >
          <LogIn className="size-4" aria-hidden="true" />
          {s.enter}
        </button>
      )}
    </div>
  );
}

/** The redirect, for when Google's window does not open; its line is kept, hidden, when the redirect is the button. */
export function OtherWay({ google, redirecting, onRedirect }: Props) {
  if (google.status === 'none') return null;
  return (
    <p className={`mt-3 text-sm text-muted ${google.status === 'failed' ? 'invisible' : ''}`}>
      {s.otherWayQuestion}
      <button
        type="button"
        onClick={onRedirect}
        disabled={redirecting}
        className="font-medium text-brand underline underline-offset-2 hover:text-brand-2 disabled:opacity-50"
      >
        {redirecting ? s.opening : s.otherWay}
      </button>
    </p>
  );
}
