// The end of an article: the line to report an error in it and, once read, the tip about the search.
import { MessageSquareWarning, Search, X } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import { keys } from '../../../shared/ui/keys';
import { articleEndStrings as s } from './strings/ArticleEnd.strings';

export function ReportLine({ onReport }: { onReport: () => void }) {
  return (
    <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6">
      <button type="button" onClick={onReport} className={`${button.base} ${button.secondary}`}>
        <MessageSquareWarning className="size-4" aria-hidden="true" />
        {s.report}
      </button>
      <p className="text-sm text-muted">{s.orSelect}</p>
    </div>
  );
}

export function SearchTip({ tip }: { tip: { slot: boolean; show: boolean; close: () => void } }) {
  if (!tip.slot) return null;
  return (
    <div className="mt-6 h-16" aria-live="polite">
      {tip.show ? (
        <p className="flex h-full items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 text-sm">
          <Search className="size-4 flex-none text-brand" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {s.tip.text}
            <span className="pointer-coarse:hidden">{s.tip.key(keys('Ctrl+K'))}</span>.
          </span>
          <button
            type="button"
            onClick={tip.close}
            aria-label={s.tip.close}
            className="flex-none rounded p-1 text-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </p>
      ) : null}
    </div>
  );
}
