// «Ver apunte» and «Preguntas» at the top of a «Más» menu of the study screens, so that they take no room from the
// card. They open once the answer shows, as they did under it; with no material, they are not there.
import type { ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { BookOpen, ListChecks } from 'lucide-react';
import type { CardMaterial } from '../model/material';
import { MENU_ITEM } from './MoreMenuParts';
import { materialItemsStrings } from './strings/MaterialItems.strings';

export function MaterialItems({
  material,
  revealed,
}: {
  material: CardMaterial | null;
  revealed: boolean;
}) {
  if (!material) return null;
  return (
    <>
      <MaterialItem href={material.notePath} disabled={!revealed}>
        <BookOpen className="size-4 text-muted" aria-hidden="true" />
        {materialItemsStrings.material.note}
      </MaterialItem>
      {material.quizPath ? (
        <MaterialItem href={material.quizPath} disabled={!revealed}>
          <ListChecks className="size-4 text-muted" aria-hidden="true" />
          {materialItemsStrings.material.quiz}
        </MaterialItem>
      ) : null}
      <Menu.Separator className="my-1 h-px bg-border" />
    </>
  );
}

function MaterialItem({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Menu.Item asChild className={MENU_ITEM} disabled={disabled}>
      <a href={disabled ? undefined : href} target="_blank" rel="noreferrer">
        {children}
      </a>
    </Menu.Item>
  );
}
