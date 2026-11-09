import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { CATEGORIES_OF, REPORT_COMMENT_MAX } from '@qv/schema';
import type { ReportCategory, ReportKind } from '@qv/schema';
import { Select } from '../../ui/Select';
import { button } from '../../ui/styles';
import { CATEGORY_LABELS, codeWithVersion } from './labels';
import { useSendReport } from './queries';
import { ReportError } from './repository';
import type { ReportTarget } from './repository';

const INTRO: Record<ReportKind, string> = {
  card: 'Cuéntanos qué está mal en esta tarjeta. Le llega al autor para corregirla.',
  note: 'Cuéntanos qué está mal en este apunte. Le llega al autor para corregirlo.',
  quiz_question: 'Cuéntanos qué está mal en esta pregunta. Le llega al autor para corregirla.',
};

/**
 * «Reportar error», the same for every content (step 2.6): the categories of that content, one box of text and
 * «Enviar». What the student found goes to the author's panel; they follow it in «Mis reportes». The error, if any,
 * goes in a place reserved for it: nothing in the popup moves.
 */
export function ReportDialog({
  target,
  category: initial,
  onClose,
  onSent,
}: {
  /** What is being reported (null: closed). */
  target: ReportTarget | null;
  /** The category chosen at first (an image's report: 'image'); by default, the content's first one. */
  category?: ReportCategory;
  onClose: () => void;
  onSent: () => void;
}) {
  const categories = target ? CATEGORIES_OF[target.kind] : [];
  const first = initial && categories.includes(initial) ? initial : (categories[0] ?? 'other');
  const [chosen, setChosen] = useState<ReportCategory | null>(null);
  const category = chosen && categories.includes(chosen) ? chosen : first;
  const [comment, setComment] = useState('');
  const send = useSendReport();
  const text = comment.trim();
  const reset = () => {
    setComment('');
    setChosen(null);
    send.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const code = target ? codeWithVersion(target.code, target.version) : null;
  const quote = target?.location.quote?.exact;
  const figure = target?.location.figure;
  return (
    <Dialog.Root open={target !== null} onOpenChange={(open) => (open ? null : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[8vh] left-1/2 z-50 max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:top-[12vh]">
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
            {target ? INTRO[target.kind] : null}
            {code ? <span className="ml-1 font-mono text-xs">{code}</span> : null}
          </Dialog.Description>
          {quote ? (
            <blockquote
              aria-label="Texto seleccionado"
              className="mt-3 line-clamp-4 border-l-2 border-brand pl-3 text-sm text-ink"
            >
              {quote}
            </blockquote>
          ) : figure ? (
            <p className="mt-3 line-clamp-3 border-l-2 border-brand pl-3 text-sm text-ink">
              Imagen: {figure}
            </p>
          ) : null}
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!target || !text || send.isPending) return;
              send.mutate(
                { ...target, category, comment: text },
                {
                  onSuccess: () => {
                    reset();
                    onSent();
                  },
                },
              );
            }}
          >
            <label htmlFor="report-category" className="text-sm font-medium">
              Qué tipo de error
            </label>
            <Select
              id="report-category"
              label="Qué tipo de error"
              value={category}
              options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              onChange={setChosen}
              modal
              className="mt-1.5 w-full max-sm:text-base"
            />
            <label htmlFor="report-comment" className="mt-4 block text-sm font-medium">
              ¿Qué está mal?
            </label>
            <textarea
              id="report-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={REPORT_COMMENT_MAX}
              rows={4}
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-border bg-bg p-3 text-base text-ink sm:text-sm"
            />
            <p className="mt-1 text-xs text-muted">
              Lo lee solo quien corrige el sitio. No escribas datos personales.
            </p>
            {/* Reserved: the error does not push the buttons. */}
            <p role="alert" className="mt-2 min-h-10 text-sm text-state-learn">
              {send.isError
                ? send.error instanceof ReportError
                  ? send.error.message
                  : 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.'
                : null}
            </p>
            <div className="mt-2 flex justify-end gap-2">
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
