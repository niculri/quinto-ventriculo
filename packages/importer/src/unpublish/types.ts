// What taking a piece off the site takes and gives.
import type { UnpublishedKind, Manifest } from '../manifest/schemas';
import type { ContentDatabase } from '../targets/contentDatabase';

export interface MediaRemover {
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Without it, the browser's index files of an assessment stay in the store. */
  deletePrefix?(prefix: string): Promise<number>;
}

export interface UnpublishResult {
  kind: UnpublishedKind;
  id: string;
  found: boolean;
  title: string | null;
  assessmentId: string | null;
  removed: Partial<
    Record<
      | 'notes'
      | 'sections'
      | 'quizzes'
      | 'questions'
      | 'decks'
      | 'ankiNotes'
      | 'cards'
      | 'staleNotes',
      number
    >
  > & { assessments?: string[] };
  usedBy: { kind: 'note' | 'ankiNote' | 'quiz'; id: string; title: string }[];
  logId: number | null;
}

export interface UnpublishOptions {
  db: ContentDatabase;
  store: MediaRemover;
  listFile: string;
  manifest: Pick<Manifest, 'notes' | 'tests'>;
  kind: UnpublishedKind;
  id: string;
  reason?: string;
  by: string;
  dryRun?: boolean;
  /** A deck of a course, a semester or the root takes every assessment below it. */
  aboveAssessment?: boolean;
  confirm: (summary: string) => Promise<boolean>;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface UnpublishOutcome {
  result: UnpublishResult;
  applied: boolean;
  alreadyListed: boolean;
  /** Only for a piece that is only in the draft: a published one leaves it through a trigger of unpublish_log. */
  draft: { found: boolean; removed: number } | null;
  calls: { db: number; store: number };
  indexFiles?: number;
  ms: number;
}

export const KIND_NAMES: Record<UnpublishedKind, string> = {
  note: 'el artículo',
  deck: 'el mazo',
  quiz: 'el test',
  image: 'la imagen',
};
