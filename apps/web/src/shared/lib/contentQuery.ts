// The reads of the material from the API: what a new page checks again and what publishing makes old.

/** In a read's `meta`: it is material, the same for every student, and the API can say whether it changed. */
export const CONTENT_QUERY = { content: true } as const;

export const isContentQuery = (query: { meta?: Record<string, unknown> | undefined }) =>
  query.meta?.content === true;
