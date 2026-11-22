// The round left halfway on a cover: where it goes, «Continuar», and «Descartar», which asks once more.
import type { Round } from '@qv/quiz';
import { resumeLine } from '@qv/quiz';
import { button, card } from '../../../shared/ui/styles';
import { resumeBannerStrings as s } from './strings/ResumeBanner.strings';

export function ResumeBanner({
  round,
  armed,
  setArmed,
  onResume,
  onDiscard,
}: {
  round: Round;
  armed: boolean;
  setArmed: (armed: boolean) => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={s.cover.resume.region}
      className={`${card} mt-4 flex flex-wrap items-center justify-between gap-3 p-4`}
    >
      <div className="min-w-0 text-sm">
        <b className="block font-medium">{s.cover.resume.title}</b>
        <span className="text-[var(--muted)]">{resumeLine(round)}</span>
      </div>
      <div className="flex flex-none gap-2">
        <button type="button" className={`${button.base} ${button.primary}`} onClick={onResume}>
          {s.cover.resume.go}
        </button>
        <button
          type="button"
          className={`${button.base} ${button.secondary}`}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            onDiscard();
          }}
        >
          {armed ? s.cover.resume.sure : s.cover.resume.discard}
        </button>
      </div>
    </div>
  );
}
