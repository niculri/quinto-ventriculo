import { useEffect, useRef } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { LETTERS, answerAt, canGoBack, displayOrder } from '@qv/quiz';
import type { Round } from '@qv/quiz';
import type { QuizQuestion } from '@qv/schema';
import { keys } from '../../ui/keys';
import type { OpenImage } from '../notes/ImageViewer';
import { Figures, Html, Table, TextWithStatements, besideStyle } from './Figures';
import type { QuestionEntry } from './useQuizSession';

/** Statement, question, figure and table (the figure beside the alternatives goes with them). */
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

/** The figure to the left of the alternatives («fig_izq»), or the alternatives alone. */
export function WithFigure({
  question,
  onZoom,
  children,
}: {
  question: QuizQuestion;
  onZoom: (image: OpenImage) => void;
  children: React.ReactNode;
}) {
  if (!(question.figureBeside && question.kind === 'choice' && question.figures.length)) {
    return <>{children}</>;
  }
  const photos = question.figures.some((f) => f.kind === 'image');
  return (
    <div className="conlado" style={besideStyle(question.figures)}>
      <div className="figura lado">
        <Figures figures={question.figures} onZoom={onZoom} />
        {photos ? <span className="zhint">Toca la imagen para ampliarla</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * The explanations under the alternatives: one per alternative («Por qué cada alternativa», with the letter
 * shown on screen), the general one («Idea clave» or «Explicación») and what was changed in the question.
 */
export function Explanation({
  question,
  order,
  chosen,
}: {
  question: QuizQuestion;
  order: number[];
  chosen: number | null;
}) {
  const perOption = question.kind === 'choice' ? question.optionExplanations : undefined;
  return (
    <>
      {question.kind === 'choice' && perOption ? (
        <div className="exp">
          <div className="rl">Por qué cada alternativa</div>
          <ol className="xalt">
            {order.map((i, k) => (
              <li
                key={i}
                className={i === question.correct ? 'xa-ok' : i === chosen ? 'xa-mal' : undefined}
              >
                <span className="xl">{LETTERS[k]}</span>
                <Html className="xt" html={perOption[i]!} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {question.explanation ? (
        <div className="exp">
          <div className="rl">{perOption ? 'Idea clave' : 'Explicación'}</div>
          <Html html={question.explanation} />
        </div>
      ) : null}
    </>
  );
}

/**
 * The question on screen. The bar «← Volver · atajos · Siguiente» stays in the same place, under the
 * alternatives: what appears on answering (the verdict, the explanation, the answer of a short question)
 * goes after it, so it does not move. An answered question (reached with «Volver», or after reloading) is
 * shown as it was answered, to read it.
 */
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
  onBack,
  onZoom,
  onReport,
}: {
  round: Round;
  entry: QuestionEntry;
  sectionLabel?: string | undefined;
  sectionIndex: number;
  /** A short question with its answer shown (before saying whether the user knew it). */
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (original: number) => void;
  onSelfAssess: (knewIt: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  onZoom: (image: OpenImage) => void;
  /** «Reportar error» of this question, once it is answered (step 2.6). */
  onReport?: () => void;
}) {
  const { question, group, number } = entry;
  const answer = answerAt(round);
  const done = !!answer;
  const order = question.kind === 'choice' ? displayOrder(round, entry.info) : [];
  const last = round.index + 1 === round.queue.length;
  const nextRef = useRef<HTMLButtonElement>(null);

  // Answered: «Siguiente» takes the focus (Enter goes on), without scrolling the page.
  useEffect(() => {
    if (done) nextRef.current?.focus({ preventScroll: true });
  }, [done, round.index]);

  const shortcut =
    question.kind === 'choice' ? (
      <>
        <kbd>1</kbd>–<kbd>{question.options.length}</kbd> responder · <kbd>{keys('Enter')}</kbd>{' '}
        siguiente · <kbd>←</kbd> volver
      </>
    ) : (
      <>
        <kbd>Espacio</kbd> ver respuesta · <kbd>1</kbd> la sabía · <kbd>2</kbd> no ·{' '}
        <kbd>{keys('Enter')}</kbd> siguiente · <kbd>←</kbd> volver
      </>
    );

  let verdict: { good: boolean; text: string } | null = null;
  if (answer) {
    if (question.kind === 'choice') {
      verdict = answer.correct
        ? { good: true, text: 'Correcta' }
        : {
            good: false,
            text: `Incorrecta. La correcta es la ${LETTERS[order.indexOf(question.correct)]}`,
          };
    } else {
      verdict = answer.correct
        ? { good: true, text: 'La sabías' }
        : { good: false, text: 'Para repasar' };
    }
  }

  return (
    <section className="wrap quizq" aria-label="Pregunta">
      <div className="meta">
        {sectionLabel ? (
          <Html className={`tag tsec s${sectionIndex % 2}`} html={sectionLabel} />
        ) : null}
        <Html className="tag" html={group.name} />
        <span className="tag t2">
          Pregunta {number}
          {question.origin ? (
            <>
              {' · '}
              <Html html={question.origin} />
            </>
          ) : null}
        </span>
      </div>
      <div className="qcard">
        <QuestionBody question={question} onZoom={onZoom} />
        {question.kind === 'choice' ? (
          <WithFigure question={question} onZoom={onZoom}>
            <ul className="opts" aria-label="Alternativas">
              {order.map((i, k) => {
                const state = !done
                  ? ''
                  : i === question.correct
                    ? 'buena'
                    : i === answer.chosen
                      ? 'mala'
                      : 'tenue';
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className={`opt ${state}`}
                      disabled={done}
                      onClick={() => onAnswer(i)}
                      aria-pressed={done ? i === answer.chosen : undefined}
                    >
                      <span className="lt">{LETTERS[k]}</span>
                      <Html className="otx" html={question.options[i]!} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </WithFigure>
        ) : !revealed && !done ? (
          <div className="abierta">
            <button type="button" className="btn2" onClick={onReveal}>
              Mostrar respuesta
            </button>
          </div>
        ) : null}

        <div className="pie">
          <button
            type="button"
            className="btn2"
            disabled={!canGoBack(round)}
            onClick={onBack}
            title="Ver la pregunta anterior (solo para leerla)"
          >
            ← Volver
          </button>
          <span className="atajo">Atajos: {shortcut}</span>
          <button ref={nextRef} type="button" className="btn" disabled={!done} onClick={onNext}>
            {last ? 'Ver resultado' : 'Siguiente'}
          </button>
        </div>

        {question.kind === 'short' && (revealed || done) ? (
          <div>
            <div className="resp">
              <div className="rl">Respuesta</div>
              <Html html={question.answer} />
            </div>
            {!done ? (
              <div className="autoev">
                <button type="button" className="bsi" onClick={() => onSelfAssess(true)}>
                  ✓ La sabía
                </button>
                <button type="button" className="bno" onClick={() => onSelfAssess(false)}>
                  ✗ No la sabía
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {verdict ? (
          <div className="vfila">
            <div className={`veredicto ${verdict.good ? 'bien' : 'mal'}`} role="status">
              <span className="vi" aria-hidden="true">
                {verdict.good ? '✓' : '✗'}
              </span>
              <span>{verdict.text}</span>
            </div>
            {onReport ? (
              <button type="button" className="qz-report" onClick={onReport}>
                <MessageSquareWarning className="size-4" aria-hidden="true" /> Reportar error
              </button>
            ) : null}
          </div>
        ) : null}
        {done ? (
          <div>
            <Explanation question={question} order={order} chosen={answer.chosen} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
