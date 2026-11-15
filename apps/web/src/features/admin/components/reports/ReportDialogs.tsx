// The popups of «Reportes»: resolving a group (what was decided, the version with the fix and a note) and blocking
// who reported.
import { useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RESOLUTION_NOTE_MAX, RESOLUTION_STATUSES } from '@qv/schema';
import type { ResolutionStatus } from '@qv/schema';
import { BlurredBackdrop, CloseX } from '../../../../shared/ui/Dialog';
import { Select } from '../../../../shared/ui/Select';
import { button } from '../../../../shared/ui/styles';
import { codeWithVersion } from '../../../reports/labels';
import { useResolveReports, useSetReportBlock } from '../../../reports/queries';
import { ReportError } from '../../../reports/api/repository';
import type { ReportGroup } from '../../../reports/api/repository';
import { fixedVersionOf, proposedVersion } from '../../model/reports';
import { reportsStrings } from '../../reports.strings';

const s = reportsStrings.dialog;

function PanelDialog({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => (open || busy ? null : onClose())}>
      <Dialog.Portal>
        <BlurredBackdrop />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[10vh] left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-xl font-semibold">{title}</Dialog.Title>
            <CloseX disabled={busy} />
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const refusal = (e: unknown) => (e instanceof ReportError ? e.message : s.failed);

/** Cancel and the action, as the popups end. */
function DialogButtons({
  busy,
  onCancel,
  children,
}: {
  busy: boolean;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className={`${button.base} ${button.secondary}`}
      >
        {s.cancel}
      </button>
      {children}
    </div>
  );
}

export function ResolveDialog({
  group: g,
  current,
  onClose,
}: {
  group: ReportGroup;
  current: number | null;
  onClose: () => void;
}) {
  const resolve = useResolveReports();
  const [status, setStatus] = useState<ResolutionStatus>('fixed');
  const [note, setNote] = useState('');
  const [version, setVersion] = useState(() => proposedVersion(g, current));
  const n = g.reports.length;
  const fixedVersion = fixedVersionOf(version);
  return (
    <PanelDialog title={reportsStrings.resolve} onClose={onClose} busy={resolve.isPending}>
      <p className="mt-1 text-sm text-muted">
        {s.closes(n)}
        {s.of}
        <span className="font-mono text-xs">
          {codeWithVersion(g.code, g.version) ?? g.targetId}
        </span>
        {s.seen}
      </p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (resolve.isPending) return;
          resolve.mutate(
            {
              kind: g.kind,
              targetId: g.targetId,
              status,
              note: note.trim() || null,
              fixedVersion: status === 'fixed' ? fixedVersion : null,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <ResolveFields
          status={status}
          onStatus={setStatus}
          version={version}
          onVersion={setVersion}
          note={note}
          onNote={setNote}
        />
        <p role="alert" className="mt-2 min-h-5 text-sm text-state-learn">
          {resolve.isError ? refusal(resolve.error) : null}
        </p>
        <DialogButtons busy={resolve.isPending} onCancel={onClose}>
          <button
            type="submit"
            disabled={resolve.isPending}
            className={`${button.base} ${button.primary}`}
          >
            {resolve.isPending ? s.saving : n === 1 ? s.resolveOne : s.resolveAll(n)}
          </button>
        </DialogButtons>
      </form>
    </PanelDialog>
  );
}

function ResolveFields({
  status,
  onStatus,
  version,
  onVersion,
  note,
  onNote,
}: {
  status: ResolutionStatus;
  onStatus: (status: ResolutionStatus) => void;
  version: string;
  onVersion: (version: string) => void;
  note: string;
  onNote: (note: string) => void;
}) {
  return (
    <>
      <label htmlFor="resolve-status" className="text-sm font-medium">
        {s.decided}
      </label>
      <Select
        id="resolve-status"
        label={s.decided}
        value={status}
        options={RESOLUTION_STATUSES.map((st) => ({
          value: st,
          label: reportsStrings.statuses[st],
        }))}
        onChange={onStatus}
        modal
        className="mt-1.5 w-full max-sm:text-base"
      />
      <label htmlFor="resolve-version" className="mt-4 block text-sm font-medium">
        {s.fixedIn}
      </label>
      <input
        id="resolve-version"
        inputMode="numeric"
        value={status === 'fixed' ? version : ''}
        disabled={status !== 'fixed'}
        onChange={(e) => onVersion(e.target.value)}
        placeholder={status === 'fixed' ? s.noVersion : s.noVersionOff}
        className="mt-1.5 w-32 rounded-lg border border-border bg-bg px-3 py-2 text-base text-ink disabled:opacity-50 sm:text-sm"
      />
      <label htmlFor="resolve-note" className="mt-4 block text-sm font-medium">
        {s.note}
      </label>
      <textarea
        id="resolve-note"
        value={note}
        onChange={(e) => onNote(e.target.value)}
        maxLength={RESOLUTION_NOTE_MAX}
        rows={3}
        className="mt-1.5 w-full rounded-lg border border-border bg-bg p-3 text-base text-ink sm:text-sm"
      />
    </>
  );
}

export function BlockDialog({
  who,
  userId,
  onClose,
}: {
  who: string;
  userId: string;
  onClose: () => void;
}) {
  const block = useSetReportBlock();
  return (
    <PanelDialog title={s.blockTitle} onClose={onClose} busy={block.isPending}>
      <p className="mt-2 text-sm text-ink">{s.blockWhat(who)}</p>
      <p role="alert" className="mt-2 min-h-5 text-sm text-state-learn">
        {block.isError ? refusal(block.error) : null}
      </p>
      <DialogButtons busy={block.isPending} onCancel={onClose}>
        <button
          type="button"
          disabled={block.isPending}
          onClick={() => block.mutate({ userId, blocked: true }, { onSuccess: onClose })}
          className={`${button.base} ${button.danger}`}
        >
          {reportsStrings.block}
        </button>
      </DialogButtons>
    </PanelDialog>
  );
}
