// A gymkana's stations as the writing mode filters them: the region and source their tags say, their priority, and
// the student's choices (which regions, sources and priorities, how many stations, the time and when to correct).

export interface RegionDef {
  tag: string;
  label: string;
}

export interface SourceDef {
  label: string;
  tags: readonly string[];
}

export interface GymkanaPlaces {
  regions: readonly RegionDef[];
  sources: readonly SourceDef[];
}

/** What a filter looks at; without a region, a source or a priority, a station passes every filter of that kind. */
export interface Filterable {
  region: string | null;
  source: string | null;
  priority: number | null;
}

export interface StationFilter {
  regions: string[];
  sources: string[];
  priorities: number[];
}

export type Correction = 'instant' | 'end';

export interface CaPreferences {
  filter: StationFilter;
  /** 0: every station that passes. */
  count: number;
  /** 0: no time limit. */
  seconds: number;
  correction: Correction;
}

export const COUNT_CHOICES = [10, 20, 50, 100, 0] as const;
export const SECONDS_CHOICES = [0, 15, 30, 60, 90] as const;

const lower = (tags: readonly string[]) => new Set(tags.map((t) => t.toLowerCase()));

export function regionOf(tags: readonly string[], regions: readonly RegionDef[]): string | null {
  const has = lower(tags);
  return regions.find((r) => has.has(r.tag.toLowerCase()))?.tag ?? null;
}

export function sourceOf(tags: readonly string[], sources: readonly SourceDef[]): string | null {
  const has = lower(tags);
  return sources.find((s) => s.tags.some((t) => has.has(t.toLowerCase())))?.label ?? null;
}

/** The «Prioridad» field: 1, 2 or 3, or null when it says something else. */
export function priorityOf(field: string | undefined): number | null {
  const n = Number((field ?? '').trim());
  return n === 1 || n === 2 || n === 3 ? n : null;
}

export function passes(station: Filterable, filter: StationFilter): boolean {
  return (
    (station.region === null || filter.regions.includes(station.region)) &&
    (station.source === null || filter.sources.includes(station.source)) &&
    (station.priority === null || filter.priorities.includes(station.priority))
  );
}

export function prioritiesOf(stations: readonly Filterable[]): number[] {
  return [...new Set(stations.flatMap((s) => (s.priority === null ? [] : [s.priority])))].sort(
    (a, b) => a - b,
  );
}

/** What a student who has chosen nothing sees: every region and source, and only the first priority there is. */
export function defaultPreferences(
  places: GymkanaPlaces,
  stations: readonly Filterable[],
): CaPreferences {
  const priorities = prioritiesOf(stations);
  return {
    filter: {
      regions: places.regions.map((r) => r.tag),
      sources: places.sources.map((s) => s.label),
      priorities: priorities.slice(0, 1),
    },
    count: 20,
    seconds: 0,
    correction: 'instant',
  };
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function known<T>(raw: unknown, allowed: readonly T[], fallback: T[]): T[] {
  return Array.isArray(raw) ? allowed.filter((a) => raw.includes(a)) : fallback;
}

function choice<T>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === raw) ?? fallback;
}

/** The saved choices, keeping only what this gymkana still has (a region taken out is no longer chosen). */
export function restorePreferences(
  raw: unknown,
  places: GymkanaPlaces,
  stations: readonly Filterable[],
): CaPreferences {
  const base = defaultPreferences(places, stations);
  if (!isRecord(raw)) return base;
  const filter = isRecord(raw.filter) ? raw.filter : {};
  return {
    filter: {
      regions: known(filter.regions, base.filter.regions, base.filter.regions),
      sources: known(filter.sources, base.filter.sources, base.filter.sources),
      priorities: known(filter.priorities, prioritiesOf(stations), base.filter.priorities),
    },
    count: choice(raw.count, COUNT_CHOICES, base.count),
    seconds: choice(raw.seconds, SECONDS_CHOICES, base.seconds),
    correction: choice(raw.correction, ['instant', 'end'] as const, base.correction),
  };
}
