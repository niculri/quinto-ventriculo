// The review list: the rules that block publishing, the warnings, the marks by hand and the button to publish.
import { useState } from 'react';
import { CircleCheck, CircleX, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { Check, ReviewList } from '@qv/release-review';
import type { ReleaseOverview } from '@qv/schema';
import { Reserved } from '../../../../shared/ui/Reserved';
import { card } from '../../../../shared/ui/styles';
import { reviewStatus } from '../../model/releases';
import { reviewSectionStrings as s } from './strings/ReviewSection.strings';
import { releasesStrings } from '../../model/strings/releases.strings';
import { ManualMarks } from './ManualMarks';
import { PublishBar } from './PublishBar';

export function ReviewSection({
  review,
  overview,
  failed,
}: {
  review: ReviewList;
  overview: ReleaseOverview;
  failed: boolean;
}) {
  const fingerprint = overview.summary.fingerprint;
  const blocks = review.checks.filter((c) => c.severity === 'block');
  const warns = review.checks.filter((c) => c.severity === 'warn');
  return (
    <section aria-labelledby="review" className="mt-8">
      <h3 id="review" className="text-lg font-semibold">
        {s.review.title}
      </h3>
      <Reserved longest={releasesStrings.review.marksMissing} className="mt-1 text-sm">
        <p role="status" className={review.blocking ? 'text-state-learn' : 'text-muted'}>
          {reviewStatus(review)}
        </p>
      </Reserved>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {s.review.failed}
        </p>
      ) : null}
      <h4 className="mt-5 text-sm font-semibold text-muted">{s.review.blocks}</h4>
      <ul className={`${card} mt-2 divide-y divide-border`}>
        {blocks.map((c) => (
          <CheckRow key={c.rule} check={c} />
        ))}
      </ul>
      <h4 className="mt-5 text-sm font-semibold text-muted">{s.review.warns}</h4>
      <ul className={`${card} mt-2 divide-y divide-border`}>
        {warns.map((c) => (
          <CheckRow key={c.rule} check={c} />
        ))}
      </ul>
      <h4 className="mt-5 text-sm font-semibold text-muted">{s.review.manual}</h4>
      <ManualMarks review={review} fingerprint={fingerprint} />
      <PublishBar review={review} overview={overview} />
    </section>
  );
}

const SHOWN = 8;

const ICON = 'size-4 flex-none';

/** The icon of a check: still checking, fine, or failing (blocking or a warning). */
function CheckIcon({ check: c, failing }: { check: Check; failing: boolean }) {
  if (c.pending) {
    return <LoaderCircle className={`${ICON} text-muted animate-spin`} aria-hidden="true" />;
  }
  if (!failing) return <CircleCheck className={`${ICON} text-state-review`} aria-hidden="true" />;
  return c.severity === 'block' ? (
    <CircleX className={`${ICON} text-state-learn`} aria-hidden="true" />
  ) : (
    <TriangleAlert className={`${ICON} text-accent`} aria-hidden="true" />
  );
}

function CheckRow({ check: c }: { check: Check }) {
  const [all, setAll] = useState(false);
  const failing = c.items.length > 0;
  return (
    <li className="px-4 py-3 sm:px-5" data-rule={c.rule}>
      <div className="flex items-center gap-3">
        <CheckIcon check={c} failing={failing} />
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{c.title}</span>
        <span className="flex-none text-xs text-muted">
          {c.pending ? s.review.checking : failing ? c.items.length : s.review.fine}
        </span>
      </div>
      {failing ? <CheckItems check={c} all={all} onToggle={() => setAll((v) => !v)} /> : null}
    </li>
  );
}

function CheckItems({
  check: c,
  all,
  onToggle,
}: {
  check: Check;
  all: boolean;
  onToggle: () => void;
}) {
  const shown = all ? c.items : c.items.slice(0, SHOWN);
  return (
    <ul className="mt-2 space-y-1 pl-7 text-sm text-muted">
      {shown.map((i) => (
        <li key={i.key} className="break-words">
          {i.text}
        </li>
      ))}
      {c.items.length > SHOWN ? (
        <li>
          <button
            type="button"
            onClick={onToggle}
            className="text-sm font-medium text-brand hover:underline"
          >
            {all ? s.review.less : s.review.all(c.items.length)}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
