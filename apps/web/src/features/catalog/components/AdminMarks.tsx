// The admin mode's tag of a page and the mark of an element of a list, from the catalog.
import { AdminMark, AdminTag } from '../../../shared/ui/AdminTag';
import { useAdminReasons } from '../hooks/useAdminReasons';
import type { Thing } from '../model/adminOnly';

export function PageTag({ thing }: { thing: Thing }) {
  return <AdminTag reasons={useAdminReasons(thing)} />;
}

export function ListMark({ thing, holder }: { thing: Thing; holder?: Thing | undefined }) {
  return <AdminMark reasons={useAdminReasons(thing, holder)} />;
}
