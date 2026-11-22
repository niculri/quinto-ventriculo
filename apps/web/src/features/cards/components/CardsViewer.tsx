// The cards page's viewer: a card of the list as it is studied (front, then back; ← → through the list) and a line
// with what can be done with it.

import { useState } from 'react';
import { BookOpen, EyeOff, Flag, History, ListChecks, MessageSquareWarning } from 'lucide-react';
import type { CardSummary } from '@qv/schema';
import { button } from '../../../shared/ui/styles';
import type { BrowseCard } from '../model/browseCards';
import { CardViewer } from '../../decks/components/CardViewer';
import { MaterialLink, ReportEntry, useCardMaterial } from '../../study';
import { useViewerActions } from '../hooks/useViewerActions';
import { HistoryDialog } from './HistoryDialog';
import type { StudyPreferences } from '../../progress/api/repository';
import { cardsViewerStrings } from './strings/CardsViewer.strings';
import { sharedStrings } from '../../../shared/strings/shared.strings';

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
  const { ref, flag, hidden, busy, blocked, message, setMessage, toggleFlag, toggleHidden } =
    useViewerActions(card, info);
  const [reporting, setReporting] = useState(false);
  const [history, setHistory] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={toggleFlag}
        disabled={busy || blocked}
        title={blocked ? cardsViewerStrings.viewer.draftOnly : undefined}
        className={ACTION}
        aria-label={flag ? cardsViewerStrings.unmark : cardsViewerStrings.viewer.mark}
      >
        <Flag className={`size-4 ${flag ? 'fill-current text-brand' : ''}`} aria-hidden="true" />
        <Label>{flag ? cardsViewerStrings.unmark : cardsViewerStrings.viewer.mark}</Label>
      </button>
      <button
        type="button"
        onClick={toggleHidden}
        disabled={busy || blocked}
        title={blocked ? cardsViewerStrings.viewer.draftOnly : undefined}
        className={ACTION}
        aria-label={hidden ? cardsViewerStrings.hideAgain : cardsViewerStrings.hideForever}
      >
        <EyeOff className="size-4" aria-hidden="true" />
        <Label>{hidden ? cardsViewerStrings.hideAgain : cardsViewerStrings.hideForever}</Label>
      </button>
      <button
        type="button"
        onClick={() => setReporting(true)}
        className={ACTION}
        aria-label={cardsViewerStrings.reportError}
      >
        <MessageSquareWarning className="size-4" aria-hidden="true" />
        <Label>{cardsViewerStrings.reportError}</Label>
      </button>
      <MaterialLinks material={material} />
      <button
        type="button"
        onClick={() => setHistory(true)}
        disabled={!info}
        className={ACTION}
        aria-label={cardsViewerStrings.viewer.history}
      >
        <History className="size-4" aria-hidden="true" />
        <Label>{cardsViewerStrings.viewer.history}</Label>
      </button>
      <span aria-live="polite" className="ml-auto flex-none pr-1 text-xs text-muted">
        {message ?? (blocked ? cardsViewerStrings.viewer.draftOnlyShort : '')}
      </span>
      {reporting ? (
        <ReportEntry
          entry={ref}
          onClose={() => setReporting(false)}
          onSent={() => {
            setReporting(false);
            setMessage(sharedStrings.reportThanks);
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
            <BookOpen className="size-4" aria-hidden="true" /> {cardsViewerStrings.viewer.note}
          </MaterialLink>
        </span>
      ) : null}
      {material?.quizPath ? (
        <span className={`${ACTION} hover:bg-transparent`}>
          <MaterialLink href={material.quizPath}>
            <ListChecks className="size-4" aria-hidden="true" />{' '}
            {cardsViewerStrings.viewer.questions}
          </MaterialLink>
        </span>
      ) : null}
    </>
  );
}
