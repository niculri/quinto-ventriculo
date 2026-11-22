// One test question on screen: statement, figures, alternatives or a short answer, the verdict and the explanations.
import { answerAt, canSkip, displayOrder } from '@qv/quiz';
import type { Round } from '@qv/quiz';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { useQuestionFocus } from '../hooks/useQuestionFocus';
import type { QuestionEntry } from '../model/entries';
import { verdictOf } from '../model/verdict';
import { questionCardStrings as s } from './strings/QuestionCard.strings';
import { Explanation } from './Explanation';
import { Html } from './Html';
import { Options } from './Options';
import { QuestionBody, WithFigure } from './QuestionBody';
import { QuestionFooter } from './QuestionFooter';
import { RevealButton, ShortAnswer } from './ShortAnswer';
import { Verdict } from './Verdict';

function QuestionMeta({
  entry,
  sectionLabel,
  sectionIndex,
}: {
  entry: QuestionEntry;
  sectionLabel?: string | undefined;
  sectionIndex: number;
}) {
  const { question, group, number } = entry;
  return (
    <div className="meta">
      {sectionLabel ? (
        <Html className={`tag tsec s${sectionIndex % 2}`} html={sectionLabel} />
      ) : null}
      <Html className="tag" html={group.name} />
      <span className="tag t2">
        {s.question.tag}
        {number}
        {question.origin ? (
          <>
            {' · '}
            <Html html={question.origin} />
          </>
        ) : null}
      </span>
    </div>
  );
}

export function QuestionCard({
  round,
  entry,
  sectionLabel,
  sectionIndex,
  revealed,
  onReveal,
  onAnswer,
  onSelfAssess,
  onNext,
  onSkip,
  onZoom,
  onReport,
}: {
  round: Round;
  entry: QuestionEntry;
  sectionLabel?: string | undefined;
  sectionIndex: number;
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (original: number) => void;
  onSelfAssess: (knewIt: boolean) => void;
  onNext: () => void;
  onSkip: () => void;
  onZoom: (image: OpenImage) => void;
  onReport?: () => void;
}) {
  const { question } = entry;
  const answer = answerAt(round);
  const done = !!answer;
  const order = question.kind === 'choice' ? displayOrder(round, entry.info) : [];
  const { nextRef, sectionRef } = useQuestionFocus(round, done);
  const verdict = verdictOf(question, answer, order);

  return (
    <section ref={sectionRef} className="wrap quizq" aria-label={s.question.region}>
      <QuestionMeta entry={entry} sectionLabel={sectionLabel} sectionIndex={sectionIndex} />
      <div className="qcard">
        <QuestionBody question={question} onZoom={onZoom} />
        {question.kind === 'choice' ? (
          <WithFigure question={question} onZoom={onZoom}>
            <Options
              question={question}
              order={order}
              done={done}
              chosen={answer?.chosen}
              onAnswer={onAnswer}
            />
          </WithFigure>
        ) : !revealed && !done ? (
          <RevealButton onReveal={onReveal} />
        ) : null}
        <QuestionFooter
          choice={question.kind === 'choice'}
          options={question.kind === 'choice' ? question.options.length : 0}
          done={done}
          skippable={canSkip(round)}
          last={round.index + 1 === round.queue.length}
          nextRef={nextRef}
          onSkip={onSkip}
          onNext={onNext}
        />
        {question.kind === 'short' && (revealed || done) ? (
          <ShortAnswer answer={question.answer} done={done} onSelfAssess={onSelfAssess} />
        ) : null}
        <Verdict verdict={verdict} onReport={onReport} />
        {done ? (
          <div>
            <Explanation question={question} order={order} chosen={answer.chosen} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
