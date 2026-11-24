// A gymkana's stations from its assessment's card index: each card of its deck with the name to write, its region,
// source and priority; the regions and sources it can be filtered by; and how many stations each choice has.
import { currentStation, passes, priorityOf, regionOf, sourceOf } from '@qv/gymkana';
import type { CaRound, Filterable, GymkanaPlaces, StationFilter } from '@qv/gymkana';
import type { CardIndex } from '@qv/schema';

export interface Station extends Filterable {
  key: string;
  noteGuid: string;
  ord: number;
  deckId: string;
  code: string | null;
  version: number | null;
  name: string;
}

export interface GymkanaStations {
  places: GymkanaPlaces;
  stations: Station[];
}

export const stationKey = (noteGuid: string, ord: number) => `${noteGuid}:${ord}`;

/** The card of a station's key; its ord is after the last «:», as a guid can have «:». */
export function stationCard(key: string) {
  const at = key.lastIndexOf(':');
  return { noteGuid: key.slice(0, at), ord: Number(key.slice(at + 1)) };
}

/** The station on screen: none without a round or once it is over. */
export const currentOf = (round: CaRound | null, byKey: ReadonlyMap<string, Station>) =>
  byKey.get((round && currentStation(round)) ?? '') ?? null;

/** The next stations of a round, asked for while one is on screen. */
export const upcomingStations = (round: CaRound) =>
  round.stations.slice(round.index + 1, round.index + 4).map(stationCard);

/** The cards of the deck (and of the decks under it) whose note has a name to write. */
export function gymkanaStations(
  index: CardIndex,
  deckIds: ReadonlySet<string>,
  deckId: string,
): GymkanaStations {
  const meta = index.gymkanas?.find((g) => g.deckId === deckId);
  const places: GymkanaPlaces = { regions: meta?.regions ?? [], sources: meta?.sources ?? [] };
  const types = new Map(index.noteTypes.map((t) => [t.id, t.fields]));
  const stations: Station[] = [];
  for (const note of index.notes) {
    const fields = types.get(note.noteTypeId) ?? [];
    const field = (name: string) => note.fields[fields.indexOf(name)];
    const name = (field('Etiqueta') ?? '').trim();
    if (!name) continue;
    for (const card of note.cards) {
      if (!deckIds.has(card.deckId)) continue;
      stations.push({
        key: stationKey(note.guid, card.ord),
        noteGuid: note.guid,
        ord: card.ord,
        deckId: card.deckId,
        code: note.code,
        version: note.version,
        name,
        region: regionOf(note.tags, places.regions),
        source: sourceOf(note.tags, places.sources),
        priority: priorityOf(field('Prioridad')),
      });
    }
  }
  return { places, stations };
}

export function chosenStations(stations: readonly Station[], filter: StationFilter): Station[] {
  return stations.filter((s) => passes(s, filter));
}

type Dimension = 'region' | 'source' | 'priority';

/** How many stations each value of a dimension has. */
export function countBy(stations: readonly Station[], dimension: Dimension) {
  const out = new Map<string | number, number>();
  for (const s of stations) {
    const v = s[dimension];
    if (v !== null) out.set(v, (out.get(v) ?? 0) + 1);
  }
  return out;
}
