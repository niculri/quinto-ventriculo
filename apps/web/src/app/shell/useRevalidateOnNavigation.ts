// On every new page the material already read is checked again: the API answers a 304 while nothing was published, so
// nothing moves, and what was published shows on that same click. Not in the admin mode: the draft has no validator.
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isContentQuery } from '../../shared/lib/contentQuery';

/**
 * What was read or checked this recently is not asked again: a few clicks in a row (a redirect, going back) cost one
 * request, not one per click, against each student's limit and the daily requests of the free plan.
 */
export const RECHECK_AFTER_MS = 15_000;

export function useRevalidateOnNavigation(pathname: string, adminMode: boolean) {
  const client = useQueryClient();
  const lastRef = useRef(pathname);
  useEffect(() => {
    if (lastRef.current === pathname) return;
    lastRef.current = pathname;
    if (adminMode) return;
    const readBefore = Date.now() - RECHECK_AFTER_MS;
    // A read still on its way is the check already.
    void client.invalidateQueries(
      { predicate: (q) => isContentQuery(q) && q.state.dataUpdatedAt <= readBefore },
      { cancelRefetch: false },
    );
  }, [client, pathname, adminMode]);
}
