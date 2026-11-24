// A gymkana: the deck named «Gymkana» right under an assessment, whose photos the writing mode asks to name, with the
// regions and sources its tags say (from the deck manifest; the card browser's index carries them to the web).
import { z } from 'zod';
import { DeckId } from './flashcards';

export const GYMKANA_DECK_LABEL = 'Gymkana';

const GymkanaRegion = z.object({ tag: z.string().min(1), label: z.string().min(1) });

const GymkanaSource = z.object({
  label: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
});

/** What the deck manifest says of a gymkana. */
export const GymkanaPlaces = z.object({
  regions: z.array(GymkanaRegion).default([]),
  sources: z.array(GymkanaSource).default([]),
});
export type GymkanaPlaces = z.infer<typeof GymkanaPlaces>;

export const GymkanaMeta = GymkanaPlaces.extend({ deckId: DeckId });
export type GymkanaMeta = z.infer<typeof GymkanaMeta>;
