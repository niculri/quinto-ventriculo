// A station of the writing mode: its photo, the box to write the name and, corrected at once, the verdict over the
// answer's photo. The bar on top says where the round is; nothing moves when the verdict comes.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { prefetchCards } from '../../study/api/prefetchCards';
import { score } from '@qv/gymkana';
import type { CaRound } from '@qv/gymkana';
import { BackButton } from '../../../shared/ui/BackButton';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { answerBar, button } from '../../../shared/ui/styles';
import { ReviewMenu, StudyCard } from '../../study';
import { upcomingStations } from '../model/stations';
import type { Station } from '../model/stations';
import { RIGHT, WRONG } from '../model/verdict';
import { CaTimer } from './CaTimer';
import { CaVerdict } from './CaVerdict';
import { stationScreenStrings as s } from './strings/StationScreen.strings';

export function StationScreen({
  round,
  station,
  back,
  backLabel,
  onSubmit,
  onToggle,
  onNext,
}: {
  round: CaRound;
  station: Station;
  back: string;
  backLabel: string;
  onSubmit: (text: string, timedOut?: boolean) => void;
  onToggle: (index: number) => void;
  onNext: () => void;
}) {
  const night = useDarkMode();
  const api = useApi();
  const client = useQueryClient();
  const [text, setText] = useState('');
  useEffect(() => {
    prefetchCards(client, api, upcomingStations(round));
  }, [api, client, round]);
  const result = round.results[round.index] ?? null;
  const shown = result !== null && round.correction === 'instant';
  const last = round.index === round.stations.length - 1;
  return (
    <>
      <StationBar
        round={round}
        station={station}
        revealed={shown}
        back={back}
        backLabel={backLabel}
      />
      <p className="sr-only">{s.noDates}</p>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <StudyCard entry={station} revealed={shown} night={night} />
        {round.seconds > 0 && !result ? (
          // Over the card's top edge, so the card starts where it does when studying with Anki.
          <div className="absolute inset-x-0 top-0 h-1.5">
            <CaTimer
              key={station.key}
              seconds={round.seconds}
              onTimeout={() => onSubmit(text, true)}
            />
          </div>
        ) : null}
      </div>
      <div className="mx-auto flex h-36 w-full max-w-2xl items-start gap-3 py-3">
        {shown ? (
          <>
            <CaVerdict result={result} name={station.name} onToggle={() => onToggle(round.index)} />
            <button
              type="button"
              // The verdict came from the keyboard: Enter goes on.
              autoFocus
              onClick={onNext}
              className={`${button.base} ${button.primary} flex-none`}
            >
              {last ? s.results : s.next}
            </button>
          </>
        ) : (
          <AnswerForm text={text} onText={setText} onSubmit={() => onSubmit(text)} />
        )}
      </div>
    </>
  );
}

function StationBar({
  round,
  station,
  revealed,
  back,
  backLabel,
}: {
  round: CaRound;
  station: Station;
  revealed: boolean;
  back: string;
  backLabel: string;
}) {
  const { right, answered, total } = score(round);
  return (
    <div className={`${answerBar} min-h-11 pb-2`}>
      <BackButton to={back} label={backLabel} className="justify-self-start" />
      <p className="min-w-0 truncate text-center text-sm font-medium tabular-nums sm:text-base">
        <span className="sm:hidden">{s.stationShort(round.index + 1, total)}</span>
        <span className="hidden sm:inline">{s.station(round.index + 1, total)}</span>
      </p>
      <div className="flex min-w-0 items-center justify-end gap-3">
        {round.correction === 'instant' ? (
          <span className="text-sm tabular-nums" aria-label={s.score(right, answered - right)}>
            <span className={RIGHT}>✓ {right}</span>{' '}
            <span className={WRONG}>✗ {answered - right}</span>
          </span>
        ) : null}
        <ReviewMenu
          current={station}
          flag={0}
          // Without «markable» the menu never marks, so it never calls this.
          onMarked={/* v8 ignore next */ () => undefined}
          markable={false}
          revealed={revealed}
        />
      </div>
    </div>
  );
}

function AnswerForm({
  text,
  onText,
  onSubmit,
}: {
  text: string;
  onText: (text: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex w-full gap-2"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => onText(e.target.value)}
        aria-label={s.yourAnswer}
        placeholder={s.placeholder}
        autoCapitalize="sentences"
        spellCheck={false}
        // A name is short; a pasted page would only make the saved round heavier.
        maxLength={120}
        autoFocus
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      <button type="submit" className={`${button.base} ${button.primary} flex-none`}>
        {s.answer}
      </button>
    </form>
  );
}
