import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { button } from '../../ui/styles';
import { useReportCard } from './queries';
import type { NewCardReport } from './repository';

const MAX = 2000;

/** «Reportar error»: what a student found wrong in a card goes to the author's panel. */
export function ReportCardDialog({
  card,
  onClose,
  onSent,
}: {
  /** The card being reported (null: closed). */
  card: Omit<NewCardReport, 'comment'> | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [comment, setComment] = useState('');
  const send = useReportCard();
  const text = comment.trim();
  const close = () => {
    setComment('');
    send.reset();
    onClose();
  };
  return (
    <Dialog.Root open={card !== null} onOpenChange={(open) => (open ? null : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[15vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-xl font-semibold">Reportar error</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar"
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Cuéntanos qué está mal en esta tarjeta. Le llega al autor para corregirla.
            {card?.code ? <span className="ml-1 font-mono text-xs">{card.code}</span> : null}
          </Dialog.Description>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!card || !text) return;
              send.mutate(
                { ...card, comment: text },
                {
                  onSuccess: () => {
                    setComment('');
                    send.reset();
                    onSent();
                  },
                },
              );
            }}
          >
            <label htmlFor="report-comment" className="text-sm font-medium">
              ¿Qué está mal?
            </label>
            <textarea
              id="report-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={MAX}
              rows={4}
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-border bg-bg p-3 text-sm text-ink"
            />
            {send.isError ? (
              <p role="alert" className="mt-2 text-sm text-state-learn">
                No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className={`${button.base} ${button.secondary}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!text || send.isPending}
                className={`${button.base} ${button.primary}`}
              >
                {send.isPending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
