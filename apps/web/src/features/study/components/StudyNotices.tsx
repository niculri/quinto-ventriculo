// The notices above the card: a heavy day (with «Seguir» and «Parar por hoy») and a session that stopped.
import { Link } from 'react-router';
import type { Counts } from '@qv/srs';
import { minutesText, totalCards } from '@qv/study';
import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';

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
        title={`Hoy son ${totalCards(opening).toLocaleString('es-CL')} tarjetas, ${minutesText(minutes)}`}
        tone="info"
      >
        <p>Puedes parar cuando quieras: lo que no alcances sale mañana.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGoOn}
            className={`${button.base} ${button.secondary} py-1.5`}
          >
            Seguir
          </button>
          <Link to={deckPath} className={`${button.base} ${button.ghost} py-1.5`}>
            Parar por hoy
          </Link>
        </div>
      </Notice>
    </div>
  );
}

export function SessionStopped({ failure }: { failure: string }) {
  return (
    <div className="pb-2">
      <Notice title="Se detuvo la sesión">
        <p>{failure}</p>
        <button
          type="button"
          className={`${button.base} ${button.secondary} mt-3`}
          onClick={() => window.location.reload()}
        >
          Volver a cargar
        </button>
      </Notice>
    </div>
  );
}
