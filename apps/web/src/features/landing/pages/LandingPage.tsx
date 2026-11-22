// The only public page: what the site is and how it is used, with no material, and the sign-in with Google.
import { LogIn } from 'lucide-react';
import { Navigate } from 'react-router';
import { Loading } from '../../../shared/ui/Loading';
import { button } from '../../../shared/ui/styles';
import { Logo } from '../../../shared/ui/Logo';
import { SiteFooter } from '../../nav/components/SiteFooter';
import { useSignIn } from '../hooks/useSignIn';
import { Hero } from '../components/Hero';
import { HowItIsUsed, Inside } from '../components/Sections';
import { Faq } from '../components/Faq';
import { heroStrings } from '../components/strings/Hero.strings';
import { landingPageStrings as s } from './strings/LandingPage.strings';

export function LandingPage() {
  const { state, next, error, urlNotice, urlNoticeTitle, signingIn, onSignIn } = useSignIn();

  if (state.status === 'loading') return <Loading fullScreen />;
  if (state.status === 'signed-in') return <Navigate to={next} replace />;
  const notice = error ?? urlNotice ?? state.notice;
  const title = !error && urlNotice ? urlNoticeTitle : heroStrings.failed;
  const signIn = () => void onSignIn();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <button
          type="button"
          onClick={signIn}
          disabled={signingIn}
          className={`${button.base} ${button.ghost}`}
        >
          <LogIn className="size-4" aria-hidden="true" />
          {s.enter}
        </button>
      </header>

      <main>
        <Hero signingIn={signingIn} onSignIn={signIn} notice={notice} title={title} />
        <Inside />
        <HowItIsUsed />
        <Faq />
      </main>

      <SiteFooter variant="landing" />
    </div>
  );
}
