// A signed image drawn by React (a test's photo, a thumbnail): kept while only its signature changes, signed again before
// it expires or once when it fails expired, and otherwise a failure its component shows in its own space.
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  RENEW_BEFORE_SEC,
  isExpired,
  mediaExpiry,
  mediaPath,
  sameImage,
  secondsNow,
  untilRenewal,
} from '../lib/signedMedia';
import type { FreshMedia, RenewMedia } from '../lib/signedMedia';

interface Failure {
  src: string;
  retrying: boolean;
}

const none: FreshMedia = () => null;

/**
 * `src` is the image's URL; the component draws `image.src` with `onError` and `onLoad`, keyed by `attempt`, and
 * while `failure` is set its notice instead (with the image hidden while `failure.retrying`, so that it can load).
 * `focusRef` is what takes the focus back when an image comes after «Reintentar» had it.
 */
export function useSignedImage(
  src: string | undefined,
  renew: RenewMedia,
  focusRef?: RefObject<HTMLElement | null>,
) {
  const [renewed, setRenewed] = useState<{ from: string; to: string } | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const triedRef = useRef(new Set<string>());
  const refocusRef = useRef(false);
  const renewingRef = useRef(false);
  const latestOf = (from: string) => (renewed?.from === from ? renewed.to : from);
  // `src` is what the page gave, `latest` its newest URL, `shown` the one drawn (the one already drawn while it is the
  // same image).
  const view =
    src === undefined
      ? null
      : {
          src,
          latest: latestOf(src),
          shown: drawn !== null && sameImage(drawn, latestOf(src)) ? drawn : latestOf(src),
        };
  const failure = failed && failed.src === view?.shown ? failed : null;

  useEffect(() => {
    if (failure || !refocusRef.current) return;
    refocusRef.current = false;
    focusRef?.current?.focus({ preventScroll: true });
  });

  const waitingUrl = view && view.shown !== drawn ? view.shown : null;
  useRenewBeforeExpiry(waitingUrl, view?.src ?? null, renew, (from, to) =>
    setRenewed({ from, to }),
  );

  const recover = async (url: string, from: string) => {
    const path = mediaPath(url);
    if (!path || !isExpired(url, secondsNow()) || triedRef.current.has(url)) {
      setFailed({ src: url, retrying: false });
      return;
    }
    triedRef.current.add(url);
    renewingRef.current = true;
    const fresh = await renew(path, secondsNow()).catch(() => none);
    renewingRef.current = false;
    const next = fresh(path);
    if (!next || next === url || isExpired(next, secondsNow())) {
      setFailed({ src: url, retrying: false });
    } else setRenewed({ from, to: next });
  };

  return {
    src: view?.shown,
    attempt,
    failure,
    onError: () => {
      // The image hidden behind the notice fails too while its new URL is on its way.
      if (!view || renewingRef.current) return;
      if (view.shown === drawn) {
        setDrawn(null);
        // The URL it kept went out of the browser's memory: the newest one is drawn instead.
        if (view.latest !== drawn) return;
      }
      void recover(view.shown, view.src);
    },
    onLoad: () => {
      if (view) setDrawn(view.shown);
      if (failure) setFailed(null);
    },
    retry: (button: HTMLElement) => {
      if (!view) return;
      refocusRef.current = button.ownerDocument.activeElement === button;
      setFailed({ src: view.shown, retrying: true });
      if (isExpired(view.shown, secondsNow())) {
        triedRef.current.delete(view.shown);
        void recover(view.shown, view.src);
      } else setAttempt((n) => n + 1);
    },
  };
}

/** An image not drawn yet (lazy, further down): signed again before its link expires, or when the page comes back. */
function useRenewBeforeExpiry(
  url: string | null,
  from: string | null,
  renew: RenewMedia,
  onFresh: (from: string, to: string) => void,
) {
  const askedRef = useRef(new Set<string>());
  const renewSoon = useEffectEvent(async () => {
    const at = url!;
    if (document.visibilityState === 'hidden' || askedRef.current.has(at)) return;
    askedRef.current.add(at);
    const before = secondsNow() + RENEW_BEFORE_SEC;
    const path = mediaPath(at)!;
    const next = (await renew(path, before).catch(() => none))(path);
    if (next && next !== at && !isExpired(next, before)) onFresh(from!, next);
  });
  const expiry = url === null ? null : mediaExpiry(url);
  useEffect(() => {
    if (expiry === null) return;
    const run = () => void renewSoon();
    const timer = setTimeout(run, untilRenewal(expiry));
    const onVisible = () => {
      if (document.visibilityState === 'visible' && secondsNow() > expiry - RENEW_BEFORE_SEC) run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [url, expiry]);
}
