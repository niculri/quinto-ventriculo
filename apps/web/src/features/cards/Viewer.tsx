// The cards page's viewer: a card of the list as it is studied (front, then back; ← → through the list) and a line
// with what can be done with it.

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, EyeOff, Flag, History, ListChecks, MessageSquareWarning } from 'lucide-react';
import type { CardSummary } from '@qv/schema';
import { useStudyRepository } from '../progress/api/context';
import { button } from '../../shared/ui/styles';
import { CardInfo } from '../browse/CardPreview';
import type { BrowseCard } from '../browse/data';
import { CardViewer } from '../decks/CardViewer';
import { useCardMaterial } from '../study/material';
import { studyKeys } from '../progress/queries';
import { timingFor } from '@qv/study';
import type { StudyPreferences } from '../progress/api/repository';
import { ReportEntry } from '../study/StudyPage';
import { MaterialLink } from '../study/MaterialRow';
import { GhostCloseX } from '../../shared/ui/Dialog';

const REVIEW_FLAG = 1;

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
  const study = useStudyRepository();
  const client = useQueryClient();
  const material = useCardMaterial(card.deckId);
  const [flag, setFlag] = useState(info?.flag ?? 0);
  const [hidden, setHidden] = useState(info?.queue === 'suspended');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [history, setHistory] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(id);
  }, [message]);
  const ref = { noteGuid: card.noteGuid, ord: card.ord, deckId: card.deckId };
  const run = async (what: () => Promise<unknown>, done: string, undo: () => void) => {
    setBusy(true);
    try {
      await what();
      setMessage(done);
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch {
      undo();
      setMessage('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  const toggleFlag = () => {
    const before = flag;
    const next = flag ? 0 : REVIEW_FLAG;
    setFlag(next);
    void run(
      () => study.setFlag(ref, next),
      next ? 'Marcada para revisar' : 'Sin marca',
      () => setFlag(before),
    );
  };
  const toggleHidden = () => {
    const before = hidden;
    setHidden(!hidden);
    void run(
      () => (before ? study.unsuspend([ref]) : study.suspend([ref], false)),
      before ? 'Se mostrará de nuevo' : 'No se mostrará más',
      () => setHidden(before),
    );
  };
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
        <Dialog.Root open={history} onOpenChange={setHistory}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
            <Dialog.Content className="fixed top-1/2 left-1/2 z-[60] max-h-[85dvh] w-[min(94vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-soft">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Dialog.Title className="text-lg font-semibold">
                  Historial de la tarjeta
                </Dialog.Title>
                <GhostCloseX />
              </div>
              <Dialog.Description className="sr-only">
                Cuándo la estudiaste y qué respondiste.
              </Dialog.Description>
              <CardInfo card={info} timing={timingFor(prefs)} simple={!prefs.fullAnki} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </>
  );
}
