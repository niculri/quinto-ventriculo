// The news of the signed-in student: the announcements, whether something is unread and marking them as seen (shown at
// once; what the database keeps comes back after).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { useNewsRepository } from '../api/context';
import { newsKeys, newsQuery, newsSeenQuery } from '../api/queries';
import { isUnread } from '../model/news';

export function useNews() {
  const api = useApi();
  const repository = useNewsRepository();
  const client = useQueryClient();
  const feed = useQuery(newsQuery(api));
  const seen = useQuery(newsSeenQuery(repository));
  const mark = useMutation({
    mutationFn: (until: string) => repository.markSeen(until),
    // Only ever called with something newer than what was seen.
    onMutate: (until) => client.setQueryData(newsKeys.seen, until),
    onSuccess: (kept) => {
      if (kept !== null) client.setQueryData(newsKeys.seen, kept);
    },
  });
  const announcements = feed.data?.announcements;
  const seenUntil = seen.data ?? null;
  // Without what was read (a failure), everything counts as unread rather than the line waiting forever.
  const ready = announcements !== undefined && (seen.isSuccess || seen.isError);
  const unread = ready ? announcements.filter((a) => isUnread(a, seenUntil)) : [];
  return {
    feed,
    announcements,
    seenUntil,
    ready,
    /** Newest first, as the feed. */
    unread,
    /** Keeps as seen what is in the list now: the newest, which is the first unread if there is any. */
    markSeen: () => {
      const newest = unread[0];
      if (newest) mark.mutate(newest.publishedAt);
    },
  };
}
