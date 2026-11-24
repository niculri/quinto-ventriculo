// The reading place of each entry of the tab's history, in sessionStorage: it lives with the tab, never in the account.
import { z } from 'zod';
import { storageKeys } from '../../../shared/lib/storage';
import type { ReadingPlace } from '../model/readingPlace';

const KEY = storageKeys.readingPlaces;
const KEEP = 30;

const Place = z.object({
  path: z.string(),
  block: z.number().int().nonnegative(),
  within: z.number().min(0).max(1),
  past: z.number().nonnegative(),
});
const Places = z.record(z.string(), z.unknown());

function all(): Record<string, unknown> {
  try {
    const parsed = Places.safeParse(JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function readingPlace(entry: string): ReadingPlace | null {
  const place = Place.safeParse(all()[entry]);
  return place.success ? place.data : null;
}

/** The newest last: past `KEEP` entries, the oldest go. */
export function saveReadingPlace(entry: string, place: ReadingPlace | null) {
  const { [entry]: _old, ...rest } = all();
  const kept = Object.entries(place ? { ...rest, [entry]: place } : rest).slice(-KEEP);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // blocked storage
  }
}
