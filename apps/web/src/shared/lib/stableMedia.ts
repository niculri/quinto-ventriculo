// Gives each image the signed link this tab got first, while it still opens long enough: a later answer with the same
// image (another card of the same plate, an answer of the next hour) then asks the browser for a URL it already has.
import {
  RENEW_BEFORE_SEC,
  mediaExpiry,
  mediaPath,
  opensOneImage,
  replaceMedia,
} from './signedMedia';

/** Past this, a link is not handed out again: the next answer's goes, before the renewal of the page asks for one. */
const KEEP_WHILE_SEC = RENEW_BEFORE_SEC + 60;

/** Images of a long while of study; the oldest link goes first. */
const MOST = 2000;

export type StableMedia = (text: string, nowSec: number) => string;

export function stableMedia(most = MOST): StableMedia {
  const links = new Map<string, { url: string; expiry: number }>();
  return (text, nowSec) =>
    replaceMedia(text, (url) => {
      const path = mediaPath(url);
      const expiry = mediaExpiry(url);
      if (path === null || expiry === null || !opensOneImage(url)) return url;
      const known = links.get(path);
      if (known && known.expiry - nowSec > KEEP_WHILE_SEC) return known.url;
      links.delete(path);
      links.set(path, { url, expiry });
      if (links.size > most) links.delete(links.keys().next().value!);
      return url;
    });
}
