// The HTML a page puts in: kept as it is while a new answer only signs its images again, so that nothing is drawn
// again, and the new URLs go only to the images that have not loaded yet.
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { patchMedia } from '../lib/mediaRecovery';
import { lookupIn, mediaUrlsIn, unsignedMedia } from '../lib/signedMedia';

/** `inShadow`: the HTML goes into the element's Shadow DOM. */
export function useSignedHtml<T extends string>(
  html: T,
  host: RefObject<HTMLElement | null>,
  inShadow = false,
): T {
  const [kept, setKept] = useState(html);
  const same = kept === html || unsignedMedia(kept) === unsignedMedia(html);
  if (!same) setKept(html);
  useEffect(() => {
    const root = inShadow ? host.current?.shadowRoot : host.current;
    if (root) patchMedia(root, lookupIn(mediaUrlsIn(html)));
  }, [html, host, inShadow]);
  return same ? kept : html;
}
