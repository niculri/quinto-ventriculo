// The top of the landing page: what the site is, who enters and the sign-in with Google, with the notice of a failed one.
import { ShieldCheck } from 'lucide-react';
import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { withContactLink } from '../../../shared/ui/ContactLink';
import { GoogleLogo, Illustration } from './Art';
import { landingStrings as s } from '../strings';

export function Hero({
  signingIn,
  onSignIn,
  notice,
  title,
}: {
  signingIn: boolean;
  onSignIn: () => void;
  notice: string | null;
  title: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <Illustration />
      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
        <p className="text-sm font-medium tracking-wide text-brand uppercase">{s.kicker}</p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] font-semibold tracking-tight sm:text-7xl">
          {s.title}
        </h1>
        <p className="mt-5 max-w-2xl font-serif text-2xl text-muted italic sm:text-[1.7rem]">
          {s.motto}
        </p>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">{s.lead}</p>
        <p className="mt-4 max-w-xl text-lg font-medium text-ink">{s.invited}</p>
        <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onSignIn}
            disabled={signingIn}
            className={`${button.base} ${button.primary} h-12 px-6 text-base`}
          >
            <GoogleLogo /> {signingIn ? s.opening : s.signIn}
          </button>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {s.onlyDomain}
          </span>
        </div>
        {notice ? (
          <div className="mt-6 max-w-xl">
            <Notice title={title} tone={title === s.failed ? 'error' : 'info'}>
              {withContactLink(notice)}
            </Notice>
          </div>
        ) : null}
      </div>
    </section>
  );
}
