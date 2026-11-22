// Signing in with Google from the landing page: the destination, the notice to show and whether Google is opening.
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { noticeText, noticeTitle } from '../../session/model/notices';
import { useSession } from '../../session/context';
import { safeDestination } from '../../session/model/destination';
import { useSignInStrings as s } from './strings/useSignIn.strings';

export function useSignIn() {
  const { state, signIn } = useSession();
  const [params] = useSearchParams();
  const next = safeDestination(params.get('next'));
  const urlNotice = noticeText(params.get('notice'));
  const urlNoticeTitle = noticeTitle(params.get('notice'));
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn(next);
    } catch {
      setError(s.googleFailed);
      setSigningIn(false);
    }
  };
  return { state, next, error, urlNotice, urlNoticeTitle, signingIn, onSignIn };
}
