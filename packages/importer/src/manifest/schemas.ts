// The schemas of the content folder: the catalog, the note, deck and test manifests and the unpublished list.
import { z } from 'zod';
import {
  Assessment,
  Course,
  DeckId,
  NoteCode,
  NoteGroup,
  NoteHeader,
  NoteKind,
  NotePractice,
  Semester,
  Slug,
  WebCode,
} from '@qv/schema';
import type { AssessmentTaxonomy, TaxonomyHistory } from '../taxonomy/types';

/** `ankiName`: the course's deck name in Anki when it differs from the site's; only the deck check uses it. */
export const CatalogCourse = Course.extend({ ankiName: z.string().min(1).optional() });
export type CatalogCourse = z.infer<typeof CatalogCourse>;

export const CatalogManifest = z.object({
  semesters: z.array(Semester),
  courses: z.array(CatalogCourse),
  assessments: z.array(Assessment),
});
export type CatalogManifest = z.infer<typeof CatalogManifest>;

export const NoteEntry = z.object({
  /** Search results and links hang from it: it never changes. */
  id: NoteCode,
  code: WebCode.optional(),
  slug: Slug,
  kind: NoteKind,
  position: z.number().int(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  header: NoteHeader.optional(),
  sources: z.array(z.string()).default([]),
  practice: NotePractice.optional(),
  group: NoteGroup.optional(),
  sourceFile: z.string().min(1),
});
export type NoteEntry = z.infer<typeof NoteEntry>;

export const NotesManifest = z.object({
  assessmentId: z.string(),
  notes: z.array(NoteEntry),
});
export type NotesManifest = z.infer<typeof NotesManifest>;

export const DecksManifest = z.object({
  assessmentId: z.string(),
  decks: z.array(
    z.object({
      apkg: z.string().min(1).endsWith('.apkg'),
      /** Without it, a package with notes that name IMAIOS stops the import (IMAIOS never goes to the site). */
      excludeImaios: z.boolean().optional(),
      /** A JSON `{ cards: [{ guid, ord }] }`, relative like `apkg`: those cards stay out of the site; a note left
       * without cards, too. For decks whose author took cards out of his own collection. */
      excludeCards: z.string().min(1).endsWith('.json').optional(),
    }),
  ),
});
export type DecksManifest = z.infer<typeof DecksManifest>;

export const QuizzesManifest = z.object({
  assessmentId: z.string(),
  tests: z.array(
    z.object({
      /** Everybody's progress hangs from it; by default it comes from the slug, so fix it before renaming one. */
      id: Slug.optional(),
      slug: Slug,
      position: z.number().int(),
      folder: z.string().min(1),
      title: z.string().min(1).optional(),
      /** These three override test.json's: null leaves it out, a text replaces it. */
      kicker: z.string().nullable().optional(),
      heading: z.string().nullable().optional(),
      footer: z.string().nullable().optional(),
      sections: z
        .record(
          z.string(),
          z.object({
            description: z.string().min(1).optional(),
            notice: z.string().min(1).nullable().optional(),
          }),
        )
        .optional(),
      questions: z.record(z.string(), z.object({ explanation: z.string().min(1) })).optional(),
      /** A question's id becomes its place in the group: only for a test that grows only at the end of each group. */
      allowPositionalIds: z.boolean().optional(),
    }),
  ),
});
export type QuizzesManifest = z.infer<typeof QuizzesManifest>;

export const UnpublishedKind = z.enum(['note', 'deck', 'quiz', 'image']);
export type UnpublishedKind = z.infer<typeof UnpublishedKind>;

const MediaKey = z
  .string()
  .regex(/^(?:notes|cards|tests)\/[0-9a-f]{16,64}\.webp$/, 'clave de imagen inválida');

const UNPUBLISHED_ID: Record<UnpublishedKind, z.ZodType<string>> = {
  note: NoteCode,
  deck: DeckId,
  quiz: Slug,
  image: MediaKey,
};

export const UnpublishedItem = z
  .object({
    kind: UnpublishedKind,
    id: z.string().min(1),
    reason: z.string().trim().min(1).max(500),
    date: z.iso.date(),
    by: z.string().min(1).max(200).optional(),
  })
  .superRefine((item, ctx) => {
    const ok = UNPUBLISHED_ID[item.kind].safeParse(item.id);
    if (!ok.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `id de ${item.kind} inválido: ${item.id}`,
      });
    }
  });
export type UnpublishedItem = z.infer<typeof UnpublishedItem>;

/** What is listed here is never published again, even while it is still in a manifest. */
export const UnpublishedList = z.object({ items: z.array(UnpublishedItem) });
export type UnpublishedList = z.infer<typeof UnpublishedList>;

export interface Manifest {
  catalog: CatalogManifest;
  notes: NotesManifest[];
  decks: DecksManifest[];
  tests?: QuizzesManifest[];
  unpublished?: UnpublishedItem[];
  taxonomies?: AssessmentTaxonomy[];
}

export interface ReadManifestOptions {
  /** By default, git's history of the folder; null: only the files of now are checked. */
  history?: TaxonomyHistory | null;
  /** false for `npm run unpublish`: a taxonomy being edited must not stop taking a piece off the site. */
  taxonomies?: boolean;
}
