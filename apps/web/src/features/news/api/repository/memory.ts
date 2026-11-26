// What the student read of the announcements, kept in the browser, for the demo and the tests.
import { settle } from '../../../../shared/lib/settle';
import { storageKeys } from '../../../../shared/lib/storage';
import type { NewsRepository } from './port';

export function localNewsRepository(
  options: { storage?: Storage | null; now?: () => number } = {},
): NewsRepository {
  const storage = options.storage ?? null;
  const now = options.now ?? Date.now;
  let memory: string | null = null;
  const read = () => {
    try {
      return storage?.getItem(storageKeys.demo.news) ?? memory;
    } catch {
      return memory;
    }
  };
  return {
    seenUntil: () => settle(read),
    markSeen: (until) =>
      settle(() => {
        const at = Math.min(Date.parse(until), now());
        const before = read();
        const kept = before && Date.parse(before) >= at ? before : new Date(at).toISOString();
        memory = kept;
        try {
          storage?.setItem(storageKeys.demo.news, kept);
        } catch {
          // blocked storage: it stays in memory
        }
        return kept;
      }),
  };
}
