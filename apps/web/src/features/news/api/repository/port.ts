// The port of what each student read of the announcements: what the Supabase adapter and the in-memory one implement.

export interface NewsRepository {
  /** The time of the newest announcement already seen (ISO), or null if none ever was. */
  seenUntil(): Promise<string | null>;
  /** Moves it forward (never back, never past now) and gives back what is kept. */
  markSeen(until: string): Promise<string | null>;
}
