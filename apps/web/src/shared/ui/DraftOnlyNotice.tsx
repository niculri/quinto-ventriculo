// The line that takes the place of «Estudiar» or «Comenzar» for what only the draft has, and says why.
import { sharedStrings } from '../strings';
import { Notice } from './Notice';

export function DraftOnlyNotice({ kind }: { kind: 'deck' | 'quiz' }) {
  return (
    <div data-draft-only="">
      <Notice tone="info" title={sharedStrings.draftOnly.title}>
        {sharedStrings.draftOnly[kind]}
      </Notice>
    </div>
  );
}
