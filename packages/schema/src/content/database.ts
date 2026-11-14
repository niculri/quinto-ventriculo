// The content database's `jsonb` as the Worker reads it: the contracts of the functions it calls and parses, and the
// `jsonb` columns it selects (db/tests/content-contracts.test.ts runs them in PGlite).
import { z } from 'zod';
import type { Database } from '@qv/db-types/content';
import { CardChanges, CardDetail } from '../anki/flashcards';
import { CardIndexRecord } from '../anki/browse-index';
import { QuizDetail } from '../quiz/quizzes';
import {
  PublishResult,
  ReleaseChecks,
  ReleaseLog,
  ReleaseMark,
  ReleaseMarkId,
  RevertResult,
} from '../release/release';
import { NoArgs, rpcContract } from '../database/contract';
import type { RpcContract } from '../database/contract';

type ContentContracts = Partial<Record<keyof Database['public']['Functions'], RpcContract>>;

/** As `site_settings()` builds it; the Worker turns `updatedAt` into ISO before `SiteSettings`. */
const SiteSettingsRow = z.object({
  hideEmptySemesters: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

const PublishInput = z.object({
  fingerprint: z.string(),
  title: z.string(),
  schemaVersion: z.number(),
  checks: ReleaseChecks,
  marks: z.array(ReleaseMarkId),
  by: z.string(),
});

/** The functions whose answer goes out as a stream (release_items, quiz_section, anki_deck_detail…) have none here. */
export const CONTENT_RPC = {
  site_settings: rpcContract(NoArgs, SiteSettingsRow),
  set_site_settings: rpcContract(
    z.object({ p: z.object({ hideEmptySemesters: z.boolean(), by: z.string() }) }),
    SiteSettingsRow,
  ),
  unpublish_log_entries: rpcContract(
    z.object({ max_entries: z.number().optional() }),
    z.object({ total: z.number(), entries: z.array(z.object({ doneAt: z.string() })) }),
  ),
  anki_browse_indexes: rpcContract(NoArgs, z.array(CardIndexRecord)),
  quiz_detail: rpcContract(z.object({ quiz_id: z.string() }), QuizDetail.nullable()),
  anki_card: rpcContract(
    z.object({ note_guid: z.string(), card_ord: z.number() }),
    CardDetail.nullable(),
  ),
  anki_card_changes_since: rpcContract(
    z.object({ since: z.number(), max_rows: z.number().optional() }),
    CardChanges,
  ),
  release_media: rpcContract(
    z.object({ after_key: z.string().nullable(), max_rows: z.number() }),
    z.object({ keys: z.array(z.string()), next: z.string().nullable() }),
  ),
  set_release_mark: rpcContract(
    z.object({
      fingerprint: z.string(),
      mark: ReleaseMarkId,
      checked: z.boolean(),
      checked_by: z.string(),
    }),
    z.array(ReleaseMark),
  ),
  publish_release: rpcContract(z.object({ p: PublishInput }), PublishResult),
  revert_release: rpcContract(
    z.object({ p: z.object({ id: z.number(), by: z.string() }) }),
    RevertResult,
  ),
  release_log: rpcContract(z.object({ max_rows: z.number().optional() }), ReleaseLog),
} satisfies ContentContracts;

/** `notes.document`: what an article adds to its columns (a note saved before some of these lacks them). */
export const NoteDocument = z
  .object({
    sources: z.array(z.string()).optional(),
    html: z.string().optional(),
    toc: z.array(z.unknown()).optional(),
    createdOn: z.string().optional(),
    header: z.unknown().optional(),
    practice: z.unknown().optional(),
    group: z.unknown().optional(),
  })
  .nullable();
export type NoteDocument = z.infer<typeof NoteDocument>;

/** `anki_note_types.templates`: the catalog only takes their names. */
export const NoteTypeTemplates = z.array(z.object({ name: z.string() }));

/** The `name, config` rows of `anki_presets`. */
export const PresetRows = z.array(
  z.object({ name: z.string(), config: z.record(z.string(), z.unknown()) }),
);
