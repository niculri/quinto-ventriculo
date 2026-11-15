// The cards page's list in groups: by lecture, then by topic, with a lecture's images together.

import type { Matched } from './filters';
import { cardsStrings } from '../strings';

interface Group {
  key: string;
  lectureId: string;
  title: string | null;
  grid: boolean;
  items: Matched[];
}

export interface Lecture {
  id: string;
  groups: Group[];
  notes: number;
}

/** The images of a lecture go in one group: their «Encabezado» is a title per figure, not a topic. */
const IMAGES_TITLE = cardsStrings.list.images;

const GRID_SHARE = 0.8;

export function groupNotes(matched: readonly Matched[]): Lecture[] {
  const lectures = new Map<string, Lecture & { byKey: Map<string, Group> }>();
  for (const m of matched) {
    const id = m.note.lectureId;
    let lecture = lectures.get(id);
    if (!lecture) {
      lecture = { id, groups: [], notes: 0, byKey: new Map() };
      lectures.set(id, lecture);
    }
    const title = m.note.image ? IMAGES_TITLE : m.note.note.topic || null;
    const key = `${id}\u001f${m.note.image ? '\u0000images' : (title ?? '')}`;
    let group = lecture.byKey.get(key);
    if (!group) {
      group = { key, lectureId: id, title, grid: false, items: [] };
      lecture.byKey.set(key, group);
      lecture.groups.push(group);
    }
    group.items.push(m);
    lecture.notes++;
  }
  return [...lectures.values()].map(({ id, groups, notes }) => {
    for (const g of groups) {
      if (g.title !== IMAGES_TITLE) continue;
      const photos = g.items.filter((m) => m.note.note.kind === 'photo').length;
      g.grid = photos >= GRID_SHARE * g.items.length;
    }
    return { id, groups, notes };
  });
}
