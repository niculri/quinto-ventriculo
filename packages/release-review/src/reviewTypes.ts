// The vocabulary of the review list: its rules, what a check holds and what the review is made from.
import type { ReleaseMarkId, ReleaseSummary } from '@qv/schema/release';
import type { PhraseHit } from './processPhrases';

export type CheckSeverity = 'block' | 'warn';

export type CheckRule =
  | 'missing_image'
  | 'guid_changed'
  | 'ord_meaning'
  | 'question_id_shifted'
  | 'key_out_of_range'
  | 'schema_version'
  | 'practice_broken'
  | 'class_without_year'
  | 'unpublished_in_draft'
  | 'imaios'
  | 'process_phrase'
  | 'deck_drop'
  | 'near_test_date'
  | 'preset_changed'
  | 'guid_maybe'
  | 'mask_moved';

/** In the panel's order. */
export const CHECK_RULES: readonly { rule: CheckRule; severity: CheckSeverity; title: string }[] = [
  { rule: 'missing_image', severity: 'block', title: 'Imágenes que faltan' },
  { rule: 'guid_changed', severity: 'block', title: 'Tarjetas con el GUID cambiado' },
  { rule: 'ord_meaning', severity: 'block', title: 'Huecos o máscaras renumerados' },
  { rule: 'question_id_shifted', severity: 'block', title: 'Preguntas con el id corrido' },
  { rule: 'key_out_of_range', severity: 'block', title: 'Claves fuera de rango' },
  { rule: 'schema_version', severity: 'block', title: 'Versión del paquete' },
  { rule: 'practice_broken', severity: 'block', title: 'Enlaces de «Ponte a prueba» rotos' },
  { rule: 'class_without_year', severity: 'block', title: 'Clases sin año' },
  { rule: 'unpublished_in_draft', severity: 'block', title: 'Material sacado del sitio' },
  { rule: 'imaios', severity: 'block', title: 'Imágenes de IMAIOS' },
  { rule: 'process_phrase', severity: 'warn', title: 'Frases de proceso o del calendario' },
  { rule: 'deck_drop', severity: 'warn', title: 'Mazos que pierden más del 10 % de sus tarjetas' },
  { rule: 'near_test_date', severity: 'warn', title: 'Cambios a menos de 7 días de la prueba' },
  { rule: 'preset_changed', severity: 'warn', title: 'Configuraciones de mazo cambiadas' },
  {
    rule: 'guid_maybe',
    severity: 'warn',
    title: 'Tarjetas quitadas y nuevas en la misma evaluación',
  },
  { rule: 'mask_moved', severity: 'warn', title: 'Máscaras que cambiaron de lugar' },
];

export interface CheckItem {
  key: string;
  assessmentId: string | null;
  text: string;
}

export interface Check {
  rule: CheckRule;
  severity: CheckSeverity;
  title: string;
  items: CheckItem[];
  pending: boolean;
}

export interface ManualMark {
  mark: ReleaseMarkId;
  label: string;
  checked: boolean;
  checkedBy: string | null;
}

export interface ReviewList {
  checks: Check[];
  manual: ManualMark[];
  blocking: number;
  pending: number;
  ready: boolean;
  empty: boolean;
}

export interface ReleaseReviewInput {
  summary: ReleaseSummary;
  browseIndexes?: readonly unknown[];
  supportedSchemaVersion: number;
  /** null while the image store is being checked. */
  missingImages: readonly string[] | null;
  /** null while the new texts are being read. */
  phrases: readonly PhraseHit[] | null;
  /** In Santiago. */
  today: string;
  marks?: readonly ReleaseMarkId[];
}

export type AddCheck = (rule: CheckRule, item: CheckItem) => void;
