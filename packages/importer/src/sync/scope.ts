// What a save brings complete: what it brings, the assessments it is limited to, and what it leaves out.

/** What the bundle brings complete; what it does not bring is left as it was. */
export interface SaveScope {
  notes: boolean;
  decks: boolean;
  tests?: boolean;
  partialNotes?: boolean;
  assessments?: string[] | undefined;
  /** Saved with the catalog, so the review list can stop a release that still has something of it. */
  unpublished?: readonly { kind: string; id: string }[];
}

export const FULL: SaveScope = { notes: true, decks: true, tests: true };

export const inScope = (scope: SaveScope, assessmentId: string | null) =>
  !scope.assessments || (assessmentId !== null && scope.assessments.includes(assessmentId));
