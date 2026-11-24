// Watches the signed images of an article or a card (shared/lib/mediaRecovery.ts): signed again with a copy of their
// read before they expire or when they fail, and a notice with «Reintentar» in their own space if they still fail.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { renewFromCache } from '../lib/mediaRenewal';
import { watchMedia } from '../lib/mediaRecovery';

/**
 * `content`: what is drawn inside, so that the images it brings are planned too. `inShadow`: the images are in the
 * element's Shadow DOM, attached here if the component has not attached it yet.
 */
export function useMediaRecovery(
  host: RefObject<HTMLElement | null>,
  content: string,
  inShadow = false,
): void {
  const client = useQueryClient();
  const watcherRef = useRef<ReturnType<typeof watchMedia>>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = inShadow ? (el.shadowRoot ?? el.attachShadow({ mode: 'open' })) : el;
    const watcher = watchMedia(root, renewFromCache(client));
    watcherRef.current = watcher;
    return () => {
      watcher.stop();
      watcherRef.current = null;
    };
  }, [client, host, inShadow]);
  useEffect(() => {
    if (content) watcherRef.current?.plan();
  }, [content]);
}
