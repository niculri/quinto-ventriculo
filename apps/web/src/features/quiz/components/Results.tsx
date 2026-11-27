// A finished round's results: score, the repeat buttons and the wrong answers with the correct one.
import { resultTitle, score, wrongAnswers } from '@qv/quiz';
import type { Round } from '@qv/quiz';
import type { QuestionEntry } from '../model/entries';
import { resultsStrings as s } from './strings/Results.strings';
import { Html } from './Html';
import { WrongAnswer } from './WrongAnswer';

function Scoreboard({
  correct,
  wrong,
  percent,
}: {
  correct: number;
  wrong: number;
  percent: number;
}) {
  return (
    <>
      <div className="marcador">
        <div className="mcell g">
          <div className="n">{correct}</div>
          <div className="l">{s.results.right}</div>
        </div>
        <div className="mcell r">
          <div className="n">{wrong}</div>
          <div className="l">{s.results.wrong}</div>
        </div>
        <div className="mcell p">
          <div className="n">{percent}%</div>
          <div className="l">{s.results.percent}</div>
        </div>
      </div>
      <div className="barra" role="img" aria-label={s.results.bar(percent)}>
        <i style={{ width: `${percent}%` }} />
      </div>
    </>
  );
}

export function Results({
  round,
  entries,
  sectionName,
  onRepeatAll,
  onRepeatWrong,
  onHome,
  onReport,
}: {
  round: Round;
  entries: Map<string, QuestionEntry>;
  sectionName: string | null;
  onRepeatAll: () => void;
  onRepeatWrong: () => void;
  onHome: () => void;
  onReport: (entry: QuestionEntry) => void;
}) {
  const result = score(round);
  const wrong = wrongAnswers(round);
  return (
    <section className="wrap wide res" aria-labelledby="quiz-result">
      {/* As every page: the title where the others have it, and its line right under it. */}
      <h1 id="quiz-result">{resultTitle(result.percent)}</h1>
      <p className="res-line mt-1 text-sm text-muted">
        {sectionName ? (
          <>
            <Html html={sectionName} />
            {' · '}
          </>
        ) : null}
        {result.answered}
        {s.results.of}
        {result.total}
        {s.results.answered}
      </p>
      <Scoreboard correct={result.correct} wrong={result.wrong} percent={result.percent} />
      <div className="acciones">
        <button type="button" className="btn" onClick={onRepeatAll}>
          {s.results.repeatAll}
        </button>
        {wrong.length ? (
          <button type="button" className="btn2" onClick={onRepeatWrong}>
            {s.results.repeatWrong}
          </button>
        ) : null}
        <button type="button" className="btn2" onClick={onHome}>
          {s.results.home}
        </button>
      </div>
      <div className="repaso">
        {wrong.length ? (
          <>
            <h2>
              {s.results.toReview}
              {wrong.length})
            </h2>
            {wrong.map((a) => (
              <WrongAnswer
                key={a.position}
                entry={entries.get(a.questionId)!}
                chosen={a.chosen}
                onReport={onReport}
              />
            ))}
          </>
        ) : (
          <div className="fallo limpio">
            <div className="fq">{s.results.clean}</div>
          </div>
        )}
      </div>
    </section>
  );
}
