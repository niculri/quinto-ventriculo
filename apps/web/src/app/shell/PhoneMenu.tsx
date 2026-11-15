// The site's menu as a drawer on narrow screens.
import * as Dialog from '@radix-ui/react-dialog';
import { CloseX } from '../../shared/ui/Dialog';
import { AppNav } from '../../features/nav/components/AppNav';
import { appStrings } from '../strings';

export function PhoneMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] overflow-y-auto border-r border-border bg-bg py-4 pr-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] shadow-soft lg:hidden">
          <div className="mb-3 flex items-center justify-between px-2.5">
            <Dialog.Title className="text-sm font-semibold">{appStrings.menu}</Dialog.Title>
            <CloseX label={appStrings.closeMenu} />
          </div>
          <Dialog.Description className="sr-only">{appStrings.menuDescription}</Dialog.Description>
          <AppNav onNavigate={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
