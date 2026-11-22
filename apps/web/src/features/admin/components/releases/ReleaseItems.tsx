// One tab of an assessment: its articles, questions or cards that change, page by page.
import type { ReleaseArticleItem, ReleaseCardItem, ReleaseQuestionItem } from '@qv/schema';
import { Skeleton } from '../../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../../shared/ui/Notice';
import { button } from '../../../../shared/ui/styles';
import { useReleaseItems } from '../../hooks/useReleases';
import { releaseItemsStrings } from './strings/ReleaseItems.strings';
import { ArticleChange, CardChange, QuestionChange } from './ItemChanges';

export type ItemKind = 'article' | 'question' | 'card';

export function ReleaseItems({
  kind,
  assessment,
  fingerprint,
}: {
  kind: ItemKind;
  assessment: string;
  fingerprint: string;
}) {
  const q = useReleaseItems(fingerprint, assessment, kind);
  if (q.isError) return <ErrorWithRetry error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div aria-busy="true" className="mt-3 space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  const items: unknown[] = q.data.pages.flatMap((p): unknown[] => p.items);
  return (
    <div className="mt-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((i) =>
          kind === 'card' ? (
            <CardChange key={(i as ReleaseCardItem).guid} item={i as ReleaseCardItem} />
          ) : kind === 'article' ? (
            <ArticleChange key={(i as ReleaseArticleItem).id} item={i as ReleaseArticleItem} />
          ) : (
            <QuestionChange key={(i as ReleaseQuestionItem).key} item={i as ReleaseQuestionItem} />
          ),
        )}
      </ul>
      {q.hasNextPage ? (
        <button
          type="button"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
          className={`${button.base} ${button.secondary} mt-3 px-3 py-1.5`}
        >
          {releaseItemsStrings.assessment.more}
        </button>
      ) : null}
    </div>
  );
}
