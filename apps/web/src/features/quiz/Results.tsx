import { resultTitle, score, wrongAnswers } from '@qv/quiz';
import type { Round } from '@qv/quiz';
import { Html, TextWithStatements } from './Figures';
import type { QuestionEntry } from './useQuizSession';

/** The results: right, wrong and percentage, the bar, the buttons and the wrong ones with the correct one. */
export function Results({
  round,
  entries,
  sectionName,
  onRepeatAll,
  onRepeatWrong,
  onHome,
}: {
  round: Round;
  entries: Map<string, QuestionEntry>;
  /** The tab's name, in a test with several. */
  sectionName: string | null;
  onRepeatAll: () => void;
  onRepeatWrong: () => void;
  onHome: () => void;
}) {
  const s = score(round);
  const wrong = wrongAnswers(round);
  return (
    <section className="wrap wide res" aria-labelledby="quiz-result">
      <p className="kicker">
        {sectionName ? (
          <>
            <Html html={sectionName} />
            {' · '}
          </>
        ) : null}
        {s.answered} de {s.total} respondidas
      </p>
      <h1 id="quiz-result">{resultTitle(s.percent)}</h1>
      <div className="marcador">
        <div className="mcell g">
          <div className="n">{s.correct}</div>
          <div className="l">buenas</div>
        </div>
        <div className="mcell r">
          <div className="n">{s.wrong}</div>
          <div className="l">malas</div>
        </div>
        <div className="mcell p">
          <div className="n">{s.percent}%</div>
          <div className="l">correctas</div>
        </div>
      </div>
      <div className="barra" role="img" aria-label={`${s.percent} % de respuestas correctas`}>
        <i style={{ width: `${s.percent}%` }} />
      </div>
      <div className="acciones">
        <button type="button" className="btn" onClick={onRepeatAll}>
          Repetir todo
        </button>
        {wrong.length ? (
          <button type="button" className="btn2" onClick={onRepeatWrong}>
            Repetir solo las malas
          </button>
        ) : null}
        <button type="button" className="btn2" onClick={onHome}>
          Volver al inicio
        </button>
      </div>
      <div className="repaso">
        {wrong.length ? (
          <>
            <h2>Para repasar ({wrong.length})</h2>
            {wrong.map((a) => {
              const e = entries.get(a.questionId);
              if (!e) return null;
              const q = e.question;
              const why = (i: number) =>
                q.kind === 'choice' && q.optionExplanations?.[i] ? (
                  <Html className="fexp" html={q.optionExplanations[i]!} />
                ) : null;
              return (
                <div key={a.position} className="fallo">
                  <div className="fl">
                    <Html html={e.group.name} /> · pregunta {e.number}
                  </div>
                  <div className="fq">
                    {q.context ? (
                      <TextWithStatements as="p" className="fctx" html={q.context} />
                    ) : null}
                    <TextWithStatements as="div" className="fpr" html={q.prompt} />
                  </div>
                  <dl>
                    {q.kind === 'choice' ? (
                      <>
                        <dt>Tu respuesta</dt>
                        <dd className="cm">
                          <Html html={q.options[a.chosen ?? 0]!} />
                          {why(a.chosen ?? 0)}
                        </dd>
                        <dt>Correcta</dt>
                        <dd className="cb">
                          <Html html={q.options[q.correct]!} />
                          {why(q.correct)}
                        </dd>
                      </>
                    ) : (
                      <>
                        <dt>Respuesta</dt>
                        <Html as="dd" className="cb" html={q.answer} />
                      </>
                    )}
                  </dl>
                  {q.explanation ? (
                    <div className="fx">
                      <Html html={q.explanation} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : (
          <div className="fallo limpio">
            <div className="fq">Sin errores. Todas las respuestas fueron correctas.</div>
          </div>
        )}
      </div>
    </section>
  );
}
