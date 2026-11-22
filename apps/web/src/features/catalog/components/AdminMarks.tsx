// The admin mode's mark of an element of a list, from the catalog.
import { AdminMark } from '../../../shared/ui/AdminTag';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import type { Crumb } from '../../../shared/ui/Breadcrumbs';
import { useAdminReasons } from '../hooks/useAdminReasons';
import type { Thing } from '../model/adminOnly';

/** The breadcrumbs of a page, with its admin mode's tags (the reasons a student does not see it) on their row. */
export function PageCrumbs({ thing, items }: { thing: Thing; items: Crumb[] }) {
  return <Breadcrumbs items={items} adminReasons={useAdminReasons(thing)} />;
}

/** A deck's mark: what its parent already says is left out. */
export function DeckMark({ deck }: { deck: { id: string; parentId: string | null } }) {
  return (
    <ListMark
      thing={['deck', deck.id]}
      holder={deck.parentId ? ['deck', deck.parentId] : undefined}
    />
  );
}

export function ListMark({ thing, holder }: { thing: Thing; holder?: Thing | undefined }) {
  return <AdminMark reasons={useAdminReasons(thing, holder)} />;
}
