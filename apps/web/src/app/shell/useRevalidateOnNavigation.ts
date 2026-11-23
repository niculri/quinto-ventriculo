// On every new page the material already read is checked again: the API answers a 304 while nothing was published, so
// nothing moves, and what was published shows on that same click. Not in the admin mode: the draft has no validator.
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isContentQuery } from '../../shared/lib/contentQuery';

export function useRevalidateOnNavigation(pathname: string, adminMode: boolean) {
  const client = useQueryClient();
  const lastRef = useRef(pathname);
  useEffect(() => {
    if (lastRef.current === pathname) return;
    lastRef.current = pathname;
    if (adminMode) return;
    // A read still on its way is the check already.
    void client.invalidateQueries({ predicate: isContentQuery }, { cancelRefetch: false });
  }, [client, pathname, adminMode]);
}
