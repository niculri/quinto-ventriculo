// A button that copies a text for the chat, and says for a moment that it did (or that it could not).
import { useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { button } from '../../../../shared/ui/styles';
import { copyButtonStrings as s } from './strings/CopyButton.strings';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={() => {
        // Without HTTPS there is no `navigator.clipboard`: that throws inside the promise, and says it could not.
        void Promise.resolve()
          .then(() => navigator.clipboard.writeText(text))
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
          {s.copy.copied}
        </span>
        <span
          aria-hidden={done !== 'failed'}
          className={`col-start-1 row-start-1 ${done === 'failed' ? '' : 'invisible'}`}
        >
          {s.copy.failed}
        </span>
      </span>
    </button>
  );
}
