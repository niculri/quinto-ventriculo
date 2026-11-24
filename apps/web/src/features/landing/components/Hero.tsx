// The top of the landing page: what the site is, who enters and the sign-in with Google, with the notice of a failed one.
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Notice } from '../../../shared/ui/Notice';
import { withContactLink } from '../../../shared/ui/ContactLink';
import { Illustration } from './Art';
import { heroStrings as s } from './strings/Hero.strings';

export function Hero({
  signIn,
  otherWay,
  notice,
  title,
}: {
  signIn: ReactNode;
  otherWay: ReactNode;
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
          {signIn}
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {s.onlyDomain}
          </span>
        </div>
        {otherWay}
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
