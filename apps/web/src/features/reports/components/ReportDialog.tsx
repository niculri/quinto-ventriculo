// «Reportar error» popup for a card, a note or a quiz question: category, comment and send.
import * as Dialog from '@radix-ui/react-dialog';
import { REPORT_COMMENT_MAX } from '@qv/schema';
import type { ReportCategory } from '@qv/schema';
import { Select } from '../../../shared/ui/Select';
import { button } from '../../../shared/ui/styles';
import { BlurredBackdrop, CloseX } from '../../../shared/ui/Dialog';
import { CATEGORY_LABELS, codeWithVersion } from '../model/labels';
import { useReportForm } from '../hooks/useReportForm';
import { ReportError } from '../api/repository';
import type { ReportTarget } from '../api/repository';
import { dialogStrings as s } from '../dialog.strings';

export function ReportDialog({
  target,
  category: initial,
  onClose,
  onSent,
}: {
  target: ReportTarget | null;
  category?: ReportCategory;
  onClose: () => void;
  onSent: () => void;
}) {
  const form = useReportForm(target, initial, onClose, onSent);
  const code = target ? codeWithVersion(target.code, target.version) : null;
  return (
    <Dialog.Root open={target !== null} onOpenChange={(open) => (open ? null : form.close())}>
      <Dialog.Portal>
        <BlurredBackdrop />
        <Dialog.Content className="fixed top-[8vh] left-1/2 z-50 max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:top-[12vh]">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-xl font-semibold">{s.title}</Dialog.Title>
            <CloseX />
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted">
            {target ? s.intro[target.kind] : null}
            {code ? <span className="ml-1 font-mono text-xs">{code}</span> : null}
          </Dialog.Description>
          <Quoted quote={target?.location.quote?.exact} figure={target?.location.figure} />
          <ReportForm form={form} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Quoted({ quote, figure }: { quote: string | undefined; figure: string | undefined }) {
  if (quote) {
    return (
      <blockquote
        aria-label={s.selected}
        className="mt-3 line-clamp-4 border-l-2 border-brand pl-3 text-sm text-ink"
      >
        {quote}
      </blockquote>
    );
  }
  if (!figure) return null;
  return (
    <p className="mt-3 line-clamp-3 border-l-2 border-brand pl-3 text-sm text-ink">
      {s.image}
      {figure}
    </p>
  );
}

function ReportForm({ form }: { form: ReturnType<typeof useReportForm> }) {
  const { categories, category, setChosen, comment, setComment, send, text, close } = form;
  return (
    <form className="mt-4" onSubmit={form.submit}>
      <label htmlFor="report-category" className="text-sm font-medium">
        {s.category}
      </label>
      <Select
        id="report-category"
        label={s.category}
        value={category}
        options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
        onChange={setChosen}
        modal
        className="mt-1.5 w-full max-sm:text-base"
      />
      <label htmlFor="report-comment" className="mt-4 block text-sm font-medium">
        {s.comment}
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
      <p className="mt-1 text-xs text-muted">{s.private}</p>
      {/* Reserved height, so an error does not push the buttons. */}
      <p role="alert" className="mt-2 min-h-10 text-sm text-state-learn">
        {send.isError ? (send.error instanceof ReportError ? send.error.message : s.failed) : null}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={close} className={`${button.base} ${button.secondary}`}>
          {s.cancel}
        </button>
        <button
          type="submit"
          disabled={!text || send.isPending}
          className={`${button.base} ${button.primary}`}
        >
          {send.isPending ? s.sending : s.send}
        </button>
      </div>
    </form>
  );
}
