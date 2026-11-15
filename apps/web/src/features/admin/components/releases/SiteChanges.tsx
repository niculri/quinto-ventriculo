// What changes above the assessments: catalog, note types, presets, decks and the card browser's indexes.
import type { ReleaseOverview } from '@qv/schema';
import { card } from '../../../../shared/ui/styles';
import { useIndexLines } from '../../hooks/useIndexLines';
import { siteLines } from '../../model/releases';

export function SiteChanges({ overview }: { overview: ReleaseOverview }) {
  const indexLines = useIndexLines(overview);
  const lines = [...siteLines(overview.summary), ...indexLines];
  if (!lines.length) return null;
  return (
    <ul className={`${card} mt-3 space-y-1 p-4 text-sm text-muted sm:p-5`}>
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}
