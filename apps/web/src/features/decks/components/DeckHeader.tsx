// The top of a deck's page: its title, how many notes and cards it has, and the ways to its cards and its statistics.

import { Link } from 'react-router';
import { ChartColumn, Search } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import { deckTitle } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { deckHeaderStrings as s } from './strings/DeckHeader.strings';

export function DeckHeader({ node }: { node: CourseDeckNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{deckTitle(node)}</h1>
        <p className="mt-2 text-muted">{s.header.counts(node.noteCount, node.cardCount)}</p>
      </div>
      <nav aria-label={s.header.tools} className="flex flex-none flex-wrap gap-2">
        <Link to={paths.cards(node.ref)} className={`${button.base} ${button.secondary}`}>
          <Search className="size-4" aria-hidden="true" /> {s.header.cards}
        </Link>
        <Link to={paths.deckStats(node.ref)} className={`${button.base} ${button.secondary}`}>
          <ChartColumn className="size-4" aria-hidden="true" /> {s.header.stats}
        </Link>
      </nav>
    </div>
  );
}
