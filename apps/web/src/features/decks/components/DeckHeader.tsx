// The top of a deck's page: its title, how many notes and cards it has, and the way to its cards.

import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import { deckTitle } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';

export function DeckHeader({ node }: { node: CourseDeckNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{deckTitle(node)}</h1>
        <p className="mt-2 text-muted">
          Mazo de Anki · {node.noteCount.toLocaleString('es-CL')}{' '}
          {node.noteCount === 1 ? 'nota' : 'notas'} · {node.cardCount.toLocaleString('es-CL')}{' '}
          {node.cardCount === 1 ? 'tarjeta' : 'tarjetas'}
        </p>
      </div>
      <nav aria-label="Herramientas de Anki" className="flex-none">
        <Link to={paths.cards(node.ref)} className={`${button.base} ${button.secondary}`}>
          <Search className="size-4" aria-hidden="true" /> Ver las tarjetas
        </Link>
      </nav>
    </div>
  );
}
