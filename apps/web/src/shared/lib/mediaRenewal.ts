// Signs again the images on screen with a copy of the read that brought them, once for all that need it; what the page
// shows never changes: the copy goes to the cache only when it differs in nothing but the signatures.
import type { Query, QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';
import { isContentQuery } from './contentQuery';
import { isExpired, lookupIn, mediaUrlsIn, unsignedMedia } from './signedMedia';
import type { FreshMedia, RenewMedia } from './signedMedia';

/** A copy asked for this recently serves again: during an outage the images that fail do not each ask for one. */
const REUSE_MS = 30_000;

interface Copy {
  settledAt: number | null;
  text: Promise<string | null>;
}

const copies = new WeakMap<Query, Copy>();
/** Reads the API refused (a piece taken off the site, a session that ended): they are not asked for again. */
const refused = new WeakSet<Query>();

/** Each answer is turned into text once: every image that fails, or is about to expire, looks through all of them. */
const texts = new WeakMap<object, string>();

function textOf(query: Query): string {
  const data = query.state.data;
  if (data === undefined) return '';
  if (typeof data !== 'object' || data === null) return JSON.stringify(data);
  const known = texts.get(data);
  if (known !== undefined) return known;
  const text = JSON.stringify(data);
  texts.set(data, text);
  return text;
}

const refuses = (error: unknown) =>
  error instanceof ApiRequestError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 429;

/** The reads on screen whose answer carries `path`: the note, the card or the test section it came in. */
function ownersOf(client: QueryClient, path: string): Query[] {
  return client.getQueryCache().findAll({
    type: 'active',
    predicate: (q) => isContentQuery(q.options) && textOf(q).includes(path),
  });
}

async function fetchCopy(client: QueryClient, owner: Query): Promise<string | null> {
  const queryFn = owner.options.queryFn;
  // A read on screen always has its function: one skipped with `skipToken` is not active.
  /* v8 ignore next */
  if (typeof queryFn !== 'function') return null;
  try {
    const data = await client.query({
      queryKey: ['media-renewal', ...owner.queryKey],
      queryFn: (context) => queryFn({ ...context, queryKey: owner.queryKey }),
      staleTime: 0,
      gcTime: 0,
      retry: false,
    });
    const text = JSON.stringify(data);
    if (unsignedMedia(text) === unsignedMedia(textOf(owner)))
      client.setQueryData(owner.queryKey, data);
    return text;
  } catch (error) {
    if (refuses(error)) refused.add(owner);
    return null;
  }
}

function copyOf(client: QueryClient, owner: Query): Promise<string | null> {
  if (refused.has(owner)) return Promise.resolve(null);
  const known = copies.get(owner);
  if (known && (known.settledAt === null || Date.now() - known.settledAt < REUSE_MS)) {
    return known.text;
  }
  const copy: Copy = { settledAt: null, text: Promise.resolve(null) };
  copy.text = fetchCopy(client, owner).finally(() => {
    copy.settledAt = Date.now();
  });
  copies.set(owner, copy);
  return copy.text;
}

export function renewFromCache(client: QueryClient): RenewMedia {
  return async (path: string, beforeSec: number): Promise<FreshMedia> => {
    const owners = ownersOf(client, path);
    const urlsOf = (text: string) => lookupIn(mediaUrlsIn(text))(path) ?? '';
    // Only the reads whose link still expires too soon: one another image renewed already serves as it is.
    const due = owners.filter((q) => isExpired(urlsOf(textOf(q)), beforeSec));
    const texts = await Promise.all(due.map((q) => copyOf(client, q)));
    return lookupIn([
      ...owners.flatMap((q) => mediaUrlsIn(textOf(q))),
      ...texts.flatMap((text) => (text === null ? [] : mediaUrlsIn(text))),
    ]);
  };
}
