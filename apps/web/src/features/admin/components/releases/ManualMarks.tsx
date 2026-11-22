// The marks by hand of this draft: each switch moves at once and the mark is saved in the background (if that fails,
// it goes back).
import { useState } from 'react';
import type { ReviewList } from '@qv/release-review';
import { Reserved } from '../../../../shared/ui/Reserved';
import { Switch } from '../../../../shared/ui/Switch';
import { card } from '../../../../shared/ui/styles';
import { useUser } from '../../../session/context';
import { useSetReleaseMark } from '../../hooks/useReleaseChanges';
import { manualMarksStrings as s } from './strings/ManualMarks.strings';

type Shown = Partial<Record<string, boolean>>;

// Outside the component: React Compiler does not compile a computed key in a destructuring.
function without(shown: Shown, mark: string): Shown {
  const { [mark]: _, ...rest } = shown;
  return rest;
}

export function ManualMarks({ review, fingerprint }: { review: ReviewList; fingerprint: string }) {
  const user = useUser();
  const mark = useSetReleaseMark(fingerprint, user.email);
  const [shown, setShown] = useState<Shown>({});
  return (
    <>
      <ul className={`${card} mt-2 divide-y divide-border`}>
        {review.manual.map((m) => (
          <li key={m.mark} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{m.label}</span>
              <Reserved longest={s.marks.longest} className="text-xs text-muted">
                {m.checkedBy ? s.marks.by(m.checkedBy) : s.marks.none}
              </Reserved>
            </span>
            <Switch
              label={m.label}
              checked={shown[m.mark] ?? m.checked}
              onChange={(checked) => {
                setShown((v) => ({ ...v, [m.mark]: checked }));
                mark.mutate(
                  { mark: m.mark, checked },
                  { onSettled: () => setShown((v) => without(v, m.mark)) },
                );
              }}
            />
          </li>
        ))}
      </ul>
      {mark.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {mark.error instanceof Error && 'status' in mark.error && mark.error.status === 409
            ? s.marks.changed
            : s.marks.failed}
        </p>
      ) : null}
    </>
  );
}
