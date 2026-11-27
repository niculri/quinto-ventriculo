// «Tarjetas» of the panel as it reads it: a deck and every deck below it in the published catalog, the users' database
// summary of their cards in the API's names, kept a minute per deck.
import { AdminCardQualityRow, CardQualityReport } from '@qv/schema';
import type { AdminCardQualityCard, Catalog, CardQuality } from '@qv/schema';
import type { Dependencies } from '../dependencies';

/** The longest of the two lists: the 50 most suspicious of an assessment fit with room to spare. */
const LIST_LIMIT = 100;
const MAX_KEPT = 50;

type CardQualityReading =
  | { ok: true; report: CardQualityReport }
  | { ok: false; reason: 'not_found' | 'failed' };

export interface CardQualityReader {
  read(token: string, deckId: string): Promise<CardQualityReading>;
}

/** The deck and its descendants, or null if the catalog does not have it. */
export function decksBelow(catalog: Catalog, deckId: string): string[] | null {
  const decks = catalog.anki.decks;
  if (!decks.some((d) => d.id === deckId)) return null;
  const children = new Map<string, string[]>();
  for (const d of decks) {
    if (d.parentId) children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const out: string[] = [];
  const stack = [deckId];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

const card = (c: AdminCardQualityCard): CardQuality => ({
  noteGuid: c.note_guid,
  ord: c.ord,
  deckId: c.deck_id,
  version: c.version,
  students: c.students,
  firstView: c.first,
  reviews: c.reviews,
  predicted: c.expected,
  medianMs: c.median_ms,
  suspended: c.suspended,
  buried: c.buried,
  flagged: c.flagged,
  leeches: c.leeches,
  openReports: c.open_reports,
  reasons: c.reasons,
});

function cardQualityReport(deckId: string, raw: unknown): CardQualityReport {
  if (raw === null) return { status: 'unavailable', deckId };
  const row = AdminCardQualityRow.parse(raw);
  return CardQualityReport.parse({
    status: 'ok',
    deckId,
    refreshedAt: row.refreshed_at === null ? null : new Date(row.refreshed_at).toISOString(),
    minStudents: row.min_students,
    measured: row.measured,
    few: row.few,
    hardest: row.hardest.map(card),
    suspicious: row.suspicious.map(card),
  });
}

export function cardQualityReader(deps: Dependencies): CardQualityReader {
  const kept = new Map<string, { until: number; report: CardQualityReport }>();
  return {
    async read(token, deckId) {
      const t = deps.now();
      const hit = kept.get(deckId);
      if (hit && hit.until > t) return { ok: true, report: hit.report };
      const decks = decksBelow(await deps.repository.catalog(), deckId);
      if (!decks) return { ok: false, reason: 'not_found' };
      let report: CardQualityReport;
      try {
        report = cardQualityReport(
          deckId,
          await deps.cardQuality.read(token, { decks, limit: LIST_LIMIT }),
        );
      } catch (e) {
        console.error(e);
        return { ok: false, reason: 'failed' };
      }
      if (kept.size >= MAX_KEPT) kept.clear();
      kept.set(deckId, { until: t + deps.cardQualityTtl, report });
      return { ok: true, report };
    },
  };
}
