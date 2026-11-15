// The decks that use a preset, each a link to its page.
import { Link } from 'react-router';
import { paths } from '../../../../shared/lib/paths';
import { card } from '../../../../shared/ui/styles';
import type { CourseDeckNode, DeckNode } from '../../../catalog/model/tree';
import { optionsStrings as o } from '../../options.strings';

export function DecksUsing({ decks }: { decks: CourseDeckNode[] }) {
  const path = (n: DeckNode) => n.name.split('::').slice(1).join(' › ');
  return (
    <section aria-label={o.decks.using} className={`${card} mt-6 px-4 py-3 sm:px-6`}>
      <h3 className="text-sm font-semibold">{o.decks.usedBy(decks.length)}</h3>
      {decks.length ? (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {decks.map((n) => (
            <li key={n.id}>
              <Link to={paths.deck(n.ref)} className="text-muted hover:text-ink">
                {path(n)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
