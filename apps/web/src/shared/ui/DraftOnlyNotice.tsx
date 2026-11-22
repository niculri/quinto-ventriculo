// The line that takes the place of «Estudiar» or «Comenzar» for what only the draft has, and says why.
import { sharedStrings } from '../strings';
import { Notice } from './Notice';

type Props = { kind: 'deck' | 'quiz' } | { kind: 'questions'; count: number };

export function DraftOnlyNotice(props: Props) {
  const s = sharedStrings.draftOnly;
  return (
    <div data-draft-only="">
      <Notice tone="info" title={props.kind === 'questions' ? s.questionsTitle : s.title}>
        {props.kind === 'questions' ? s.questions(props.count) : s[props.kind]}
      </Notice>
    </div>
  );
}
