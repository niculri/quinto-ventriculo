// The checks that come from the decks, presets and dates of the summary rather than from its findings.
import type { ReleaseAssessment, ReleaseSummary } from '@qv/schema/release';
import type { AddCheck } from './reviewTypes';
import { assessmentName, lastName } from './summaryText';

type ReleaseDeck = ReleaseSummary['decks'][number];

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

function presetChange(d: ReleaseDeck, assessmentId: string | null, add: AddCheck): void {
  if (d.op === 'changed' && d.presetBefore !== d.presetAfter) {
    add('preset_changed', {
      key: `deck:${d.id}`,
      assessmentId,
      text: `${lastName(d.name)}: de «${d.presetBefore ?? 'sin configuración'}» a «${d.presetAfter ?? 'sin configuración'}».`,
    });
  }
}

function nearTestDate(s: ReleaseSummary, a: ReleaseAssessment, today: string, add: AddCheck): void {
  const near = [a.suggestedDate, a.suggestedDateBefore]
    .filter((d): d is string => !!d)
    .map((d) => ({ d, days: daysBetween(today, d) }))
    .find((x) => x.days >= 0 && x.days <= 7);
  if (near) {
    add('near_test_date', {
      key: a.id,
      assessmentId: a.id,
      text: `${assessmentName(s, a.id)}: la prueba sugerida es ${
        near.days === 0 ? 'hoy' : near.days === 1 ? 'mañana' : `en ${near.days} días`
      } (${near.d}).`,
    });
  }
}

export function deckChecks(s: ReleaseSummary, today: string, add: AddCheck): void {
  for (const a of s.assessments) {
    for (const d of a.decks) {
      if (d.cardsBefore > 0 && d.cardsAfter < d.cardsBefore * 0.9) {
        add('deck_drop', {
          key: d.id,
          assessmentId: a.id,
          text: `${lastName(d.name)}: de ${d.cardsBefore} a ${d.cardsAfter} tarjetas.`,
        });
      }
      presetChange(d, a.id, add);
    }
    nearTestDate(s, a, today, add);
  }
  for (const d of s.decks) presetChange(d, null, add);
  for (const p of s.presets) {
    add('preset_changed', {
      key: `preset:${p.name}`,
      assessmentId: null,
      text: `La configuración «${p.name}» ${p.op === 'added' ? 'es nueva' : p.op === 'removed' ? 'sale' : 'cambia'}.`,
    });
  }
}
