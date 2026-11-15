// The end of a round of review or practice: how many cards and how many «Otra vez».
import { Link } from 'react-router';
import { PartyPopper } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import type { Round } from '@qv/study';

export function RoundDone({
  round,
  deckPath,
  label,
  onAgain,
  title = 'Terminaste el repaso',
  againLabel = 'Otro repaso',
}: {
  round: Round;
  deckPath: string;
  label: string;
  onAgain: () => void;
  title?: string;
  againLabel?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">{title}</h1>
      <p className="mt-4 text-sm text-muted">
        {round.total.toLocaleString('es-CL')} {round.total === 1 ? 'tarjeta' : 'tarjetas'}
        {round.again > 0
          ? ` · «Otra vez» ${round.again} ${round.again === 1 ? 'vez' : 'veces'}`
          : ''}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={deckPath} className={`${button.base} ${button.primary}`}>
          Volver a {label}
        </Link>
        <button type="button" onClick={onAgain} className={`${button.base} ${button.secondary}`}>
          {againLabel}
        </button>
      </div>
    </div>
  );
}
