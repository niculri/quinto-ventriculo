// The names of the decks: what Anki's tree must say for each level, the levels a deck sits at, and the parents the
// importer creates because Anki exports none.
import { createHash } from 'node:crypto';
import type { AnkiDeckRecord } from '@qv/schema';
import { ImportError } from '../ImportError';

/** The preset Anki gives the decks it creates. */
export const DEFAULT_PRESET = 'Default';

/** 19 digits, so it never meets an Anki deck id (a creation time in ms, 13 digits). */
export function containerDeckId(name: string): string {
  const digest = createHash('sha256').update(`qv-deck:${name}`).digest();
  const n = digest.readBigUInt64BE(0) % 9_000_000_000_000_000_000n;
  return String(n + 1_000_000_000_000_000_000n);
}

export function levelOf(
  name: string,
  semester: number | null,
  courseId: string | null,
  assessmentId: string | null,
): Pick<AnkiDeckRecord, 'semester' | 'courseId' | 'assessmentId'> {
  const depth = name.split('::').length;
  return {
    semester: depth >= 2 ? semester : null,
    courseId: depth >= 3 ? courseId : null,
    assessmentId: depth >= 4 ? assessmentId : null,
  };
}

export function checkDeckName(label: string, name: string, expected: string[], hasCards: boolean) {
  const parts = name.split('::');
  const what = ['la raíz', 'el semestre', 'el ramo', 'el certamen'];
  for (let i = 0; i < Math.min(parts.length, expected.length); i++) {
    if (parts[i] !== expected[i]) {
      throw new ImportError(
        'material',
        `${label}: el mazo «${name}» tiene «${parts[i]!}» donde va ${what[i]!} («${expected[i]!}», ` +
          'según content/catalog.json y el manifiesto). Corrige el nombre del mazo en Anki, o el manifiesto ' +
          '(un ramo que en Anki se llama distinto lleva «ankiName» en el catálogo).',
      );
    }
  }
  if (hasCards && parts.length < expected.length) {
    throw new ImportError(
      'material',
      `${label}: el mazo «${name}» tiene tarjetas, pero no está dentro de un certamen ` +
        `(«${expected.join('::')}::…»).`,
    );
  }
}

/** Anki's note id is its creation time in ms. */
export function createdAt(noteId: string): string | null {
  const ms = Number(noteId);
  return ms >= Date.UTC(2006, 0, 1) && ms <= Date.UTC(2100, 0, 1)
    ? new Date(ms).toISOString()
    : null;
}

export function sameConfig(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const strip = ({ id: _i, mod: _m, usn: _u, ...rest }: Record<string, unknown>) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

export function safeDecode(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
