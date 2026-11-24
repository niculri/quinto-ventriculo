// Which weeks of an assessment's notes are open in the menu: the one of the note being read, and those opened or closed
// by hand while staying in the same assessment.

interface WeekToggle {
  open: boolean;
  /** The note being read when it was opened or closed. */
  note: string | null;
}

export interface WeekMemory {
  /** The assessment of the page where the weeks were opened or closed; another one forgets them. */
  assessmentId: string | null;
  toggled: Readonly<Record<string, WeekToggle>>;
}

export const NO_WEEKS: WeekMemory = { assessmentId: null, toggled: {} };

/** The page the menu is on: its assessment and the note being read. */
export interface WeekPlace {
  assessmentId: string | null;
  noteSlug: string | null;
}

const toggledAt = (memory: WeekMemory, place: WeekPlace) =>
  memory.assessmentId === place.assessmentId ? memory.toggled : {};

/** The week of the note being read opens on arriving at that note, whatever was done with it before. */
export function weekOpen(
  memory: WeekMemory,
  place: WeekPlace,
  key: string,
  holdsNote: boolean,
): boolean {
  const toggle = toggledAt(memory, place)[key];
  if (!toggle || (holdsNote && toggle.note !== place.noteSlug)) return holdsNote;
  return toggle.open;
}

export function toggleWeek(
  memory: WeekMemory,
  place: WeekPlace,
  key: string,
  holdsNote: boolean,
): WeekMemory {
  return {
    assessmentId: place.assessmentId,
    toggled: {
      ...toggledAt(memory, place),
      [key]: { open: !weekOpen(memory, place, key, holdsNote), note: place.noteSlug },
    },
  };
}
