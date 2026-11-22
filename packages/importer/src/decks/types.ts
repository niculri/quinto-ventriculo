// What building the decks takes and gives, and what is accumulated while the packages are read.
import type { AnkiPackage } from '@qv/anki-format';
import type {
  AnkiDeckRecord,
  AnkiNoteTypeRecord,
  AnkiPresetRecord,
  Assessment,
  ImportedAnkiNote,
  Semester,
} from '@qv/schema';
import type { ImageDataProcessor, ProcessedImage } from '../media/images';
import type { CatalogCourse, DecksManifest } from '../manifest/schemas';

export interface DecksResult {
  noteTypes: AnkiNoteTypeRecord[];
  presets: AnkiPresetRecord[];
  decks: AnkiDeckRecord[];
  notes: Omit<ImportedAnkiNote, 'hash' | 'updatedAt'>[];
  media: Map<string, ProcessedImage>;
  warnings: string[];
}

export interface DecksOptions {
  manifests: DecksManifest[];
  assessments: Map<string, Assessment>;
  courses: CatalogCourse[];
  semesters: Semester[];
  root: string;
  process: ImageDataProcessor;
  onProgress?: (message: string) => void;
  read?: (path: string) => Promise<AnkiPackage>;
}

/** What the packages add up to, keyed as the published records are. */
export interface DecksState {
  noteTypes: Map<string, AnkiNoteTypeRecord>;
  presets: Map<string, AnkiPresetRecord>;
  decks: Map<string, AnkiDeckRecord>;
  deckIds: Set<string>;
  guids: Set<string>;
  result: DecksResult;
}

/** The names the decks of one assessment must have: root, semester, course and assessment. */
export interface AssessmentPlace {
  semesterNumber: number;
  courseId: string;
  assessmentId: string;
  expected: string[];
}
