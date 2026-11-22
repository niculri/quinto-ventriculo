// A question's statement: context, prompt, figures (unless they go beside the alternatives) and table; and the frame
// that puts the figures beside the alternatives.
import type { ReactNode } from 'react';
import type { QuizQuestion } from '@qv/schema';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { besideStyle } from '../model/figures';
import { quizStrings as s } from '../strings';
import { Figures, Table } from './Figures';
import { TextWithStatements } from './TextWithStatements';

export function QuestionBody({
  question,
  onZoom,
}: {
  question: QuizQuestion;
  onZoom: (image: OpenImage) => void;
}) {
  const beside = question.figureBeside && question.kind === 'choice';
  return (
    <>
      {question.context ? (
        <TextWithStatements as="p" className="enun" html={question.context} />
      ) : null}
      <TextWithStatements as="h2" className="preg" html={question.prompt} />
      {question.figures.length && !beside ? (
        <div className="figura">
          <Figures figures={question.figures} onZoom={onZoom} />
        </div>
      ) : null}
      {question.table ? (
        <div className="tablabox">
          <Table table={question.table} />
        </div>
      ) : null}
    </>
  );
}

export function WithFigure({
  question,
  onZoom,
  children,
}: {
  question: QuizQuestion;
  onZoom: (image: OpenImage) => void;
  children: ReactNode;
}) {
  if (!(question.figureBeside && question.kind === 'choice' && question.figures.length)) {
    return <>{children}</>;
  }
  const photos = question.figures.some((f) => f.kind === 'image');
  return (
    <div className="conlado" style={besideStyle(question.figures)}>
      <div className="figura lado">
        <Figures figures={question.figures} onZoom={onZoom} />
        {photos ? <span className="zhint">{s.figures.zoomHint}</span> : null}
      </div>
      {children}
    </div>
  );
}
