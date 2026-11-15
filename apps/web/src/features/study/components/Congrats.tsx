// The full mode's end screen: why nothing is left and when the next cards come.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PartyPopper } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import type { CongratsInfo } from '@qv/study';

/** Anki's congrats.rs: «¡Felicitaciones!…» and when the next cards come. */
export function Congrats({
  info,
  deckPath,
  summary,
}: {
  info: CongratsInfo;
  deckPath: string;
  summary: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">
        ¡Felicitaciones! Has finalizado este mazo por ahora.
      </h1>
      {summary}
      <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
        {info.learnMessage ? <p>{info.learnMessage}</p> : null}
        {info.reviewLimitReached ? (
          <p>
            Has alcanzado el límite actual de repasos, pero todavía hay tarjetas a la espera de ser
            repasadas. Para una memorización óptima, considera aumentar el límite diario en las
            opciones.
          </p>
        ) : null}
        {info.newLimitReached ? (
          <p>
            Hay más tarjetas nuevas disponibles, pero has alcanzado el límite diario. Puedes
            aumentar el límite en las opciones, pero ten en cuenta que cuantas más tarjetas nuevas
            introduzcas, más aumentará tu carga de trabajo a corto plazo.
          </p>
        ) : null}
        {info.buried ? <p>Una o más tarjetas fueron enterradas y se mostrarán mañana.</p> : null}
        <p>Programadas para mañana: {info.dueTomorrow}</p>
      </div>
      <Link to={deckPath} className={`${button.base} ${button.primary} mt-8`}>
        Volver al mazo
      </Link>
    </div>
  );
}
