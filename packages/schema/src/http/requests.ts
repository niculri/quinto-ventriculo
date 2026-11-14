// What the API accepts in a route's path, query, body and headers. A query or header that is missing comes as
// `undefined`; the ones that only normalize (search, the list of tests, the image's signature) never fail.
import { z } from 'zod';
import { NoteGuid } from '../anki/flashcards';
import { ReleaseItemKind, ReleaseMarkId } from '../release/release';
import { UsageOpenRequest } from './usage';
import { PREVIEW_VALUE } from './headers';

const BEARER = /^Bearer\s+(\S+)$/i;
const HEX_32 = /^[0-9a-f]{32}$/;
const INDEX_SEGMENT = /^[a-z0-9-]{1,80}$/;

/** At most `n` UTF-16 units, as `.length` counts them: zod's `max` counts code points, so an emoji would count once. */
const upTo = (n: number) => z.string().refine((text) => text.length <= n);

/** The session token of `Authorization: Bearer <token>`. */
export const BearerToken = z
  .string()
  .regex(BEARER)
  .transform((header) => BEARER.exec(header)![1]!);

/** Only this value of PREVIEW_HEADER asks for the draft. */
export const PreviewRequest = z.literal(PREVIEW_VALUE);

/** An `Accept-Encoding` that takes the card index as it is stored, gzipped. */
export const AcceptsGzip = z.string().regex(/\bgzip\b/i);

export const SearchQuery = z.object({
  q: z
    .string()
    .optional()
    .transform((q) => (q ?? '').trim().slice(0, 200)),
  limit: z
    .string()
    .optional()
    .transform((limit) => Math.min(50, Math.max(1, Number.parseInt(limit ?? '20', 10) || 20))),
});

/** An empty filter is no filter. */
export const QuizzesQuery = z.object({
  course: z.string().optional(),
  assessment: z.string().optional(),
});

export const CardIndexParams = z.object({
  course: z.string().regex(INDEX_SEGMENT),
  assessment: z.string().regex(INDEX_SEGMENT),
  hash: z.string().regex(HEX_32),
});

export const CardChangesQuery = z.object({ since: z.string().regex(/^\d{1,15}$/) });

export const CardParams = z.object({ noteGuid: NoteGuid, ord: z.string().regex(/^\d{1,4}$/) });

/** At most 512 UTF-16 units of JSON: whatever comes is counted, so nothing big is read. */
export const UsageOpenBody = upTo(512)
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'not JSON' });
      return z.NEVER;
    }
  })
  .pipe(UsageOpenRequest);

export const ReleaseItemsQuery = z.object({
  kind: ReleaseItemKind,
  assessment: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  after: upTo(200).optional(),
});

export const ReleasePageQuery = z.object({ after: upTo(300).optional() });

export const ReleaseMarkRequest = z.object({
  fingerprint: z.string().regex(HEX_32),
  mark: ReleaseMarkId,
  checked: z.boolean(),
});

/** The key of a private image: lowercase folders, no «..». */
export const MediaKey = z
  .string()
  .regex(/^[a-z0-9]+(?:\/[a-z0-9._-]+)+$/)
  .refine((key) => !key.includes('..'));

/** The signature is checked afterwards: a missing or odd one does not open anything. */
export const MediaQuery = z.object({
  e: z
    .string()
    .optional()
    .transform((e) => Number(e)),
  s: z
    .string()
    .optional()
    .transform((s) => s ?? ''),
  p: z.string().optional(),
});
