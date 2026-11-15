// The cards page's viewer: a card of the list as it is studied (front, then back; ← → through the list) and a line
// with what can be done with it.

import { useState } from 'react';
import { BookOpen, EyeOff, Flag, History, ListChecks, MessageSquareWarning } from 'lucide-react';
import type { CardSummary } from '@qv/schema';
import { button } from '../../../shared/ui/styles';
import type { BrowseCard } from '../model/browseCards';
import { CardViewer } from '../../decks/CardViewer';
import { MaterialLink, ReportEntry, useCardMaterial } from '../../study';
import { useViewerActions } from '../hooks/useViewerActions';
import { HistoryDialog } from './HistoryDialog';
import type { StudyPreferences } from '../../progress/api/repository';

export function CardsViewer({
  cards,
  index,
  byKey,
  prefs,
  onIndexChange,
  onClose,
}: {
  cards: CardSummary[];
  index: number;
  byKey: ReadonlyMap<string, BrowseCard>;
  prefs: StudyPreferences;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const current = cards[index]!;
  const info = byKey.get(`${current.noteGuid}\u001f${current.ord}`);
  return (
    <CardViewer
      cards={cards}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      actions={
        <Actions
          key={`${current.noteGuid}/${current.ord}`}
          card={current}
          info={info}
          prefs={prefs}
        />
      }
    />
  );
}

const Label = ({ children }: { children: string }) => (
  <span className="hidden sm:inline">{children}</span>
);

const ACTION = `${button.base} ${button.ghost} h-9 flex-none px-2.5 py-0 text-xs sm:text-sm`;

function Actions({
  card,
  info,
  prefs,
}: {
  card: CardSummary;
  info: BrowseCard | undefined;
  prefs: StudyPreferences;
}) {
  const material = useCardMaterial(card.deckId);
  const { ref, flag, hidden, busy, message, setMessage, toggleFlag, toggleHidden } =
    useViewerActions(card, info);
  const [reporting, setReporting] = useState(false);
  const [history, setHistory] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={toggleFlag}
        disabled={busy}
        className={ACTION}
        aria-label={flag ? 'Quitar la marca' : 'Marcar'}
      >
        <Flag className={`size-4 ${flag ? 'fill-current text-brand' : ''}`} aria-hidden="true" />
        <Label>{flag ? 'Quitar la marca' : 'Marcar'}</Label>
      </button>
      <button
        type="button"
        onClick={toggleHidden}
        disabled={busy}
        className={ACTION}
        aria-label={hidden ? 'Volver a mostrar' : 'No mostrar más'}
      >
        <EyeOff className="size-4" aria-hidden="true" />
        <Label>{hidden ? 'Volver a mostrar' : 'No mostrar más'}</Label>
      </button>
      <button
        type="button"
        onClick={() => setReporting(true)}
        className={ACTION}
        aria-label="Reportar error"
      >
        <MessageSquareWarning className="size-4" aria-hidden="true" />
        <Label>Reportar error</Label>
      </button>
      <MaterialLinks material={material} />
      <button
        type="button"
        onClick={() => setHistory(true)}
        disabled={!info}
        className={ACTION}
        aria-label="Historial"
      >
        <History className="size-4" aria-hidden="true" />
        <Label>Historial</Label>
      </button>
      <span aria-live="polite" className="ml-auto flex-none pr-1 text-xs text-muted">
        {message ?? ''}
      </span>
      {reporting ? (
        <ReportEntry
          entry={ref}
          onClose={() => setReporting(false)}
          onSent={() => {
            setReporting(false);
            setMessage('Gracias: tu reporte le llegó al autor.');
          }}
        />
      ) : null}
      {info ? (
        <HistoryDialog open={history} onOpenChange={setHistory} info={info} prefs={prefs} />
      ) : null}
    </>
  );
}

function MaterialLinks({ material }: { material: ReturnType<typeof useCardMaterial> }) {
  return (
    <>
      {material ? (
        <span className={`${ACTION} hover:bg-transparent`}>
          <MaterialLink href={material.notePath}>
            <BookOpen className="size-4" aria-hidden="true" /> Ver apunte
          </MaterialLink>
        </span>
      ) : null}
      {material?.quizPath ? (
        <span className={`${ACTION} hover:bg-transparent`}>
          <MaterialLink href={material.quizPath}>
            <ListChecks className="size-4" aria-hidden="true" /> Preguntas
          </MaterialLink>
        </span>
      ) : null}
    </>
  );
}
