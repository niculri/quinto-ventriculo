// The shapes the taxonomy reading and checks share: what is read per assessment and what the import reports.
import type { TaxonomyFile, TopicMapFile } from '@qv/schema';

export interface AssessmentTaxonomy {
  assessmentId: string;
  taxonomy: TaxonomyFile;
  map: TopicMapFile;
  history?: 'commit' | 'shallow' | 'none';
}

export interface TaxonomyReport {
  assessmentId: string;
  version: number | null;
  units: number;
  /** Active topics only (not retired nor joined). */
  topics: number;
  cards: number;
  questions: number;
  unchecked: string[];
  notices: string[];
}

/**
 * Every committed version of the content folder's files, not only HEAD's: otherwise an edit or a deletion that was
 * already committed would pass. Paths are relative to the content folder.
 */
export interface TaxonomyHistory {
  shallow: boolean;
  /** Newest first, a side branch before the main one; merges included, deletions skipped. */
  versions(relativePath: string): Promise<string[]>;
  committedFiles(relativeDir: string): Promise<string[]>;
}
