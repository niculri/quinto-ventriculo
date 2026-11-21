// The admin mode's tag of a page and the mark of an element of a list, from the catalog.
import { AdminMark, AdminTag } from '../../../shared/ui/AdminTag';
import { useAdminReasons } from '../hooks/useAdminReasons';
import type { Thing } from '../model/adminOnly';

export function PageTag({ thing }: { thing: Thing }) {
  return <AdminTag reasons={useAdminReasons(thing)} />;
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
