import * as Menu from '@radix-ui/react-dropdown-menu';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A menu that is not modal, as all of the site's: a modal one leaves the page behind it hidden but focusable (axe)
 * and locks its scroll, which moved the page. So the tap outside that closes it also reaches what is under it. With
 * `closeOnly`, where that could show an answer or answer a card, the tap only closes the menu.
 */
export function MenuRoot({
  closeOnly = false,
  children,
}: {
  closeOnly?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !closeOnly) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-radix-menu-content], [aria-haspopup="menu"][data-state="open"]')) {
        return;
      }
      setOpen(false);
      swallowNextClick();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, closeOnly]);
  return (
    <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
      {children}
    </Menu.Root>
  );
}

/** The click of that same tap, and only it: the next pointerdown forgets it (a drag ends without a click). */
function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    forget();
  };
  const forget = () => {
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', forget, true);
  };
  window.addEventListener('click', swallow, true);
  window.addEventListener('pointerdown', forget, true);
}
