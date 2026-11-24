// A package's gymkana: the deck «Gymkana» right under its assessment, with the regions and sources its entry gives,
// and what the writing mode needs of its notes (the name to write in «Etiqueta»; a region and a source by its tags).
import { GYMKANA_DECK_LABEL } from '@qv/schema';
import type { GymkanaMeta, ImportedAnkiNote } from '@qv/schema';
import { ImportError } from '../ImportError';
import type { DecksManifest } from '../manifest/schemas';
import type { AssessmentPlace } from './types';

type Entry = DecksManifest['decks'][number];
type Note = Omit<ImportedAnkiNote, 'hash' | 'updatedAt'>;

const hasAny = (tags: readonly string[], wanted: readonly string[]) => {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  return wanted.some((w) => set.has(w.toLowerCase()));
};

/** The gymkana of a package, or null; a «gymkana» entry without that deck is the manifest's mistake. */
export function gymkanaOf(
  label: string,
  entry: Entry,
  place: AssessmentPlace,
  decks: readonly { id: string; name: string }[],
): GymkanaMeta | null {
  const name = [...place.expected, GYMKANA_DECK_LABEL].join('::');
  const deck = decks.find((d) => d.name === name);
  if (!deck) {
    if (!entry.gymkana) return null;
    throw new ImportError(
      'manifest',
      `${label}: su entrada trae «gymkana», pero el paquete no tiene el mazo «${name}».`,
    );
  }
  return {
    deckId: deck.id,
    regions: entry.gymkana?.regions ?? [],
    sources: entry.gymkana?.sources ?? [],
  };
}

/** What the writing mode would miss of the gymkana's notes, counted, so that a big deck gives a line, not thousands. */
export function gymkanaWarnings(
  meta: GymkanaMeta,
  notes: readonly Note[],
  hasEntry: boolean,
): string[] {
  const mine = notes.filter((n) => n.cards.some((c) => c.deckId === meta.deckId));
  const out: string[] = [];
  if (!hasEntry) {
    out.push(
      `el mazo «${GYMKANA_DECK_LABEL}» no trae «gymkana» en content/decks/: escribir el nombre no tendrá regiones ni fuentes.`,
    );
  }
  const count = (what: string, n: number) => {
    if (n) out.push(`${n} estación(es) de la gymkana ${what}.`);
  };
  count(
    'sin «Etiqueta» (no se preguntan al escribir el nombre)',
    mine.filter((n) => !(n.fields.Etiqueta ?? '').trim()).length,
  );
  const regionTags = meta.regions.map((r) => r.tag);
  if (regionTags.length) {
    count('sin región', mine.filter((n) => !hasAny(n.tags, regionTags)).length);
  }
  if (meta.sources.length) {
    count(
      'sin fuente',
      mine.filter((n) => !meta.sources.some((s) => hasAny(n.tags, s.tags))).length,
    );
  }
  return out;
}
