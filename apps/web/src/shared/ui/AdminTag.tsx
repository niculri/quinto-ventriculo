// What marks, in the admin mode, a page or an element that a student does not see, and why: «Borrador», «Semestre
// oculto» and/or «Ramo apagado».
import type { AdminReason } from '@qv/schema/http';
import { sharedStrings } from '../strings';

const pill =
  'inline-flex items-center rounded-full border border-accent/40 bg-accent/10 font-medium whitespace-nowrap text-[#9a4a12] dark:text-accent';

/** The tags of a page, on the row of its breadcrumbs (see `Breadcrumbs`): as tall as the row, to the right. */
export function AdminTag({ reasons }: { reasons: readonly AdminReason[] }) {
  if (!reasons.length) return null;
  return (
    <span data-admin-tag="" className="flex h-5 flex-none items-center gap-1">
      {reasons.map((r) => (
        <span key={r} className={`${pill} px-2 text-[0.7rem] leading-4`}>
          {sharedStrings.adminOnly[r]}
        </span>
      ))}
    </span>
  );
}

/** The mark of an element in a list or the menu: the same text, smaller, after its name. */
export function AdminMark({ reasons }: { reasons: readonly AdminReason[] }) {
  if (!reasons.length) return null;
  return (
    <span data-admin-mark="" className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {reasons.map((r) => (
        <span key={r} className={`${pill} px-1.5 text-[0.62rem] leading-[0.9rem] font-semibold`}>
          {sharedStrings.adminOnly[r]}
        </span>
      ))}
    </span>
  );
}
