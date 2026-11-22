// The table's preview: the current card (the first of a note in «Notas») and its information, or what to do.

import type { SchedTiming } from '@qv/srs';
import { card as cardStyle } from '../../../shared/ui/styles';
import type { BrowseCard, BrowseNoteRow } from '../model/browseCards';
import type { ViewPrefs } from '../hooks/useViewPrefs';
import { CardPreview } from './CardPreview';
import { tablePreviewStrings } from './strings/TablePreview.strings';

export function TablePreview({
  current,
  mode,
  timing,
  onEnlarge,
}: {
  current: BrowseCard | null;
  mode: ViewPrefs['mode'];
  timing: SchedTiming;
  onEnlarge: () => void;
}) {
  return (
    <aside
      aria-label={tablePreviewStrings.preview.label}
      className={`${cardStyle} mt-4 min-w-0 p-4`}
    >
      {current ? (
        <CardPreview
          onEnlarge={onEnlarge}
          key={current.key}
          card={mode === 'notes' ? (current as BrowseNoteRow).cards[0]! : current}
          timing={timing}
        />
      ) : (
        <p className="text-sm text-muted">{tablePreviewStrings.preview.choose}</p>
      )}
    </aside>
  );
}
