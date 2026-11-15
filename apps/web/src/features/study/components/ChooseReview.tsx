// The start of a final review: everything seen, or only what was marked and hard.
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { button, card } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import type { CardRef } from '../../progress/api/repository';

export function ChooseReview({
  node,
  pools,
  onChoose,
}: {
  node: CourseDeckNode;
  pools: { all: CardRef[]; hard: CardRef[] };
  onChoose: (cards: CardRef[]) => void;
}) {
  const option = (title: string, text: string, cards: CardRef[], count = cards.length) => (
    <button
      type="button"
      disabled={count === 0}
      onClick={() => onChoose(cards)}
      className={`${card} block w-full p-4 text-left transition hover:border-border-strong disabled:pointer-events-none disabled:opacity-60`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className="flex-none text-sm text-muted tabular-nums">
          {count.toLocaleString('es-CL')} {count === 1 ? 'tarjeta' : 'tarjetas'}
        </span>
      </span>
      <span className="mt-1 block text-sm text-muted">{text}</span>
    </button>
  );
  return (
    <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-2 py-6">
      <h1 className="font-serif text-2xl font-semibold">Repaso final de {node.label}</h1>
      {pools.all.length === 0 ? (
        <>
          <p className="mt-2 text-muted">
            Todavía no has visto tarjetas de este certamen. Cuando estudies algunas, podrás
            repasarlas aquí.
          </p>
          <Link to={paths.deck(node.ref)} className={`${button.base} ${button.primary} mt-6`}>
            Volver a {node.label}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">Este repaso no cambia las fechas de tus tarjetas.</p>
          <div className="mt-6 space-y-3">
            {option('Todo lo visto', 'Parte por lo que estás más cerca de olvidar.', pools.all)}
            {option(
              'Solo lo marcado y lo difícil',
              'Las que marcaste para revisar y las que has fallado varias veces.',
              pools.hard,
            )}
          </div>
        </>
      )}
    </div>
  );
}
