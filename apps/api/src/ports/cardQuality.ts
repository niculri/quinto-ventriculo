// What the panel's «Tarjetas» reads: the users' database summary of every student's answers per card.

/** A type, not an interface, so that it is the `Json` argument of `admin_card_quality()`. */
export type CardQualityScope = { decks: string[]; limit: number };

export interface CardQualitySource {
  /** Null when the database does not have the summary yet (its migration is not applied). */
  read(token: string, scope: CardQualityScope): Promise<unknown>;
}

export const NO_CARD_QUALITY: CardQualitySource = {
  read: () => Promise.reject(new Error('The card quality is not configured')),
};
