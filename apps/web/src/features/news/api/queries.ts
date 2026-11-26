// The reads of the news, with their keys: the announcements the student may read and up to when they saw them.
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import type { NewsRepository } from './repository';

export const newsKeys = {
  feed: ['news'] as const,
  seen: ['news-seen'] as const,
};

/** Read again when a page that shows them opens after this long. */
const NEWS_STALE_MS = 5 * 60_000;
/**
 * An announcement comes out at its time with nobody publishing anything, so an open tab reads again now and then; it
 * already waited 30 minutes, and every read is a request to the Worker, counted in its daily quota.
 */
const NEWS_REFRESH_MS = 15 * 60_000;

export const newsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: newsKeys.feed,
    queryFn: ({ signal }) => api.news(signal),
    staleTime: NEWS_STALE_MS,
    refetchInterval: NEWS_REFRESH_MS,
  });

export const newsSeenQuery = (news: NewsRepository) =>
  queryOptions({
    queryKey: newsKeys.seen,
    queryFn: () => news.seenUntil(),
    staleTime: NEWS_STALE_MS,
  });
