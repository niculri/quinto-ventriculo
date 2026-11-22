// The line that takes the place of «Estudiar» or «Comenzar» for what only the draft has, and says why.
import { draftOnlyNoticeStrings as s } from './strings/DraftOnlyNotice.strings';
import { Notice } from './Notice';

type Props = { kind: 'deck' | 'quiz' } | { kind: 'questions'; count: number };

export function DraftOnlyNotice(props: Props) {
  return (
    <div data-draft-only="">
      <Notice
        tone="info"
        title={props.kind === 'questions' ? s.draftOnly.questionsTitle : s.draftOnly.title}
      >
        {props.kind === 'questions' ? s.draftOnly.questions(props.count) : s.draftOnly[props.kind]}
      </Notice>
    </div>
  );
}
