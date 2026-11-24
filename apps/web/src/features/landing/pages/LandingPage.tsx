// The only public page: what the site is and how it is used, with no material, and the sign-in with Google.
import { Navigate } from 'react-router';
import { Loading } from '../../../shared/ui/Loading';
import { Logo } from '../../../shared/ui/Logo';
import { SiteFooter } from '../../nav/components/SiteFooter';
import { useSignIn } from '../hooks/useSignIn';
import { Hero } from '../components/Hero';
import { HowItIsUsed, Inside } from '../components/Sections';
import { Faq } from '../components/Faq';
import { HeaderSignIn, HeroSignIn, OtherWay } from '../components/SignInButtons';
import { heroStrings } from '../components/strings/Hero.strings';

export function LandingPage() {
  const { state, next, error, urlNotice, urlNoticeTitle, signingIn, onSignIn, google } =
    useSignIn();

  if (state.status === 'loading') return <Loading fullScreen />;
  if (state.status === 'signed-in') return <Navigate to={next} replace />;
  const notice = error ?? urlNotice ?? state.notice;
  const title = !error && urlNotice ? urlNoticeTitle : heroStrings.failed;
  const buttons = { google, redirecting: signingIn, onRedirect: () => void onSignIn() };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <HeaderSignIn {...buttons} />
      </header>

      <main>
        <Hero
          signIn={<HeroSignIn {...buttons} />}
          otherWay={<OtherWay {...buttons} />}
          notice={notice}
          title={title}
        />
        <Inside />
        <HowItIsUsed />
        <Faq />
      </main>

      <SiteFooter variant="landing" />
    </div>
  );
}
