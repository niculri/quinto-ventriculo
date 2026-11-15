// The bar to report the passage selected in an article.
import { MessageSquareWarning } from 'lucide-react';
import { noteStrings } from '../strings';

/** Fixed at the bottom, not next to the selection, where the phone's handles and menu are. */
export function SelectionReportBar({ onReport }: { onReport: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onReport}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-base font-medium text-bg shadow-soft sm:text-sm"
      >
        <MessageSquareWarning className="size-4" aria-hidden="true" />
        {noteStrings.reportSelection}
      </button>
    </div>
  );
}
