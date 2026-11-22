// What building the bundle takes and gives.
import type { AnkiPackage } from '@qv/anki-format';
import type { ContentBundle } from '@qv/schema';
import type { ImageDataProcessor, ImageProcessor, ProcessedImage } from '../media/images';
import type { Manifest } from '../manifest/schemas';
import type { TaxonomyReport } from '../taxonomy/types';
import type { Skipped } from './unpublished';

export interface BuildOptions {
  manifest: Manifest;
  root: string;
  process: ImageProcessor;
  processCardImage?: ImageDataProcessor;
  /** Note codes; with them, no decks or tests are imported. */
  only?: string[];
  onlyDecks?: boolean;
  onlyTests?: boolean;
  assessments?: string[];
  processQuizImage?: ImageDataProcessor;
  readApkg?: (path: string) => Promise<AnkiPackage>;
  now?: () => Date;
  onProgress?: (message: string) => void;
}

export interface BuildResult {
  bundle: ContentBundle;
  media: Map<string, ProcessedImage>;
  warnings: string[];
  /** Only when the bundle has every published deck do the targets remove the rest. */
  decksIncluded: boolean;
  notesIncluded: boolean;
  testsIncluded: boolean;
  unpublished: Skipped[];
  taxonomy: TaxonomyReport[];
}
