// The notices above the card: a heavy day (with «Seguir» and «Parar por hoy») and a session that stopped.
import { Link } from 'react-router';
import type { Counts } from '@qv/srs';
import { minutesText, totalCards } from '@qv/study';
import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { studyNoticesStrings } from './strings/StudyNotices.strings';

export function HeavyDayNotice({
  opening,
  minutes,
  deckPath,
  onGoOn,
}: {
  opening: Counts;
  minutes: number;
  deckPath: string;
  onGoOn: () => void;
}) {
  return (
    <div className="pb-2">
      <Notice
        title={studyNoticesStrings.heavy.title(
          totalCards(opening).toLocaleString('es-CL'),
          minutesText(minutes),
        )}
        tone="info"
      >
        <p>{studyNoticesStrings.heavy.text}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGoOn}
            className={`${button.base} ${button.secondary} py-1.5`}
          >
            {studyNoticesStrings.heavy.goOn}
          </button>
          <Link to={deckPath} className={`${button.base} ${button.ghost} py-1.5`}>
            {studyNoticesStrings.heavy.stop}
          </Link>
        </div>
      </Notice>
    </div>
  );
}

export function SessionStopped({ failure }: { failure: string }) {
  return (
    <div className="pb-2">
      <Notice title={studyNoticesStrings.stopped.title}>
        <p>{failure}</p>
        <button
          type="button"
          className={`${button.base} ${button.secondary} mt-3`}
          onClick={() => window.location.reload()}
        >
          {studyNoticesStrings.stopped.reload}
        </button>
      </Notice>
    </div>
  );
}
