// The draft once its overview came: its review list and what changes, in the site and by assessment.
import type { ReleaseOverview } from '@qv/schema';
import { Skeleton } from '../../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../../shared/ui/Notice';
import { card } from '../../../../shared/ui/styles';
import { useReleaseOverview, useReleaseReview } from '../../hooks/useReleases';
import { shownAssessments } from '../../model/releases';
import { releaseBodyStrings as s } from './strings/ReleaseBody.strings';
import { AssessmentChanges } from './AssessmentChanges';
import { ReviewSection } from './ReviewSection';
import { SiteChanges } from './SiteChanges';

export function ReleaseBody() {
  const overview = useReleaseOverview(true);
  if (overview.isError) {
    return (
      <div className="mt-6">
        <ErrorWithRetry error={overview.error} onRetry={() => void overview.refetch()} />
      </div>
    );
  }
  if (!overview.data) {
    return (
      <div aria-busy="true" className="mt-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  return <Release overview={overview.data} />;
}

function Release({ overview }: { overview: ReleaseOverview }) {
  const { review, errors } = useReleaseReview(overview);
  if (!review) return null;
  if (review.empty) {
    return <p className={`${card} mt-8 p-5 text-muted`}>{s.empty}</p>;
  }
  return (
    <>
      <ReviewSection review={review} overview={overview} failed={errors.length > 0} />
      <section aria-labelledby="changes" className="mt-10">
        <h3 id="changes" className="text-lg font-semibold">
          {s.changes}
        </h3>
        <SiteChanges overview={overview} />
        <div className="mt-4 space-y-4">
          {shownAssessments(overview.summary).map((a) => (
            <AssessmentChanges key={a.id} a={a} overview={overview} />
          ))}
        </div>
      </section>
    </>
  );
}
