// A button that copies a text for the chat, and says for a moment that it did (or that it could not).
import { useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { button } from '../../../../shared/ui/styles';
import { reportsStrings } from '../../reports.strings';

const s = reportsStrings.copy;

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone('copied'))
          .catch(() => setDone('failed'));
        setTimeout(() => setDone('idle'), 2500);
      }}
      className={`${button.base} ${button.secondary} px-3 py-1.5`}
    >
      <ClipboardCopy className="size-4" aria-hidden="true" />
      <span className="grid">
        {/* Every text in the same cell: the widest one sets the width. */}
        <span className={`col-start-1 row-start-1 ${done === 'idle' ? '' : 'invisible'}`}>
          {label}
        </span>
        <span
          aria-hidden={done !== 'copied'}
          className={`col-start-1 row-start-1 ${done === 'copied' ? '' : 'invisible'}`}
        >
          {s.copied}
        </span>
        <span
          aria-hidden={done !== 'failed'}
          className={`col-start-1 row-start-1 ${done === 'failed' ? '' : 'invisible'}`}
        >
          {s.failed}
        </span>
      </span>
    </button>
  );
}
