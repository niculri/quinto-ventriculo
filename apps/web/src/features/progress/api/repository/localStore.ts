// The browser copy's storage: the data it keeps (in the browser's storage, or only in memory if that fails), the
// moments it writes and the rules of its study day.
import { dayOf } from '@qv/srs';
import type {
  ActionName,
  AssessmentSetting,
  CardKey,
  CardRef,
  DeckActivation,
  DeckSetting,
  QueueName,
  StoredCard,
  StudyPreferences,
  UserPreset,
} from './model';
import { defaultPreferences } from './model';
import { storageKeys } from '../../../../shared/lib/storage';

export interface LogRow extends CardRef {
  id: number;
  actionId: string;
  action: ActionName;
  reviewedAt: string;
  rating: number | null;
  queueBefore: QueueName | null;
  before: StoredCard | null;
  after: StoredCard;
  /** What an answer sends (null for the other changes); absent in what was kept before. */
  interval?: number | null;
  durationMs?: number | null;
  /** When it was written, for the 48 hours of undo, and its study day then (as review_log.study_day). */
  loggedAt?: string;
  day?: number;
}

export interface LocalData {
  cards: StoredCard[];
  log: LogRow[];
  presets: UserPreset[];
  settings: DeckSetting[];
  preferences: StudyPreferences | null;
  activations: DeckActivation[];
  assessments: AssessmentSetting[];
  syncedTo?: number;
  practice?: { day: string; deckId: string; n: number }[];
}

const empty = (): LocalData => ({
  cards: [],
  log: [],
  presets: [],
  settings: [],
  preferences: null,
  activations: [],
  assessments: [],
});

/** The zone and the hour the day starts as the database takes them: Santiago and 4:00 without preferences. */
export const dayRule = (d: LocalData) => ({
  timeZone: d.preferences?.timeZone ?? 'America/Santiago',
  dayStartsAt: d.preferences?.dayStartsAt ?? 4,
});

export const studyDay = (d: LocalData, atMs: number) => {
  const rule = dayRule(d);
  return dayOf(atMs / 1000, rule.timeZone, rule.dayStartsAt);
};

export const same = (a: CardKey, b: CardKey) => a.noteGuid === b.noteGuid && a.ord === b.ord;

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createLocalStore(
  storage: Storage | null = safeLocalStorage(),
  preferences?: Partial<StudyPreferences>,
) {
  const KEY = storageKeys.demo.study;
  let memory: LocalData = {
    ...empty(),
    preferences: preferences ? { ...defaultPreferences(), ...preferences } : null,
  };
  const read = (): LocalData => {
    // A copy, as the database would give: what was read does not change under whoever holds it.
    if (!storage) return structuredClone(memory);
    try {
      return { ...empty(), ...(JSON.parse(storage.getItem(KEY) ?? 'null') as LocalData | null) };
    } catch {
      return empty();
    }
  };
  const write = (d: LocalData) => {
    memory = d;
    try {
      storage?.setItem(KEY, JSON.stringify(d));
    } catch {
      // full or blocked storage: it stays in memory for this visit
    }
  };
  // A moment strictly later than the last one written (two changes in the same millisecond are not equal).
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  return { read, write, stamp };
}

export type LocalStore = ReturnType<typeof createLocalStore>;
