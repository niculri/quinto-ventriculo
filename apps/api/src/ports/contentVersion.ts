// How the API learns that what the students get changed: a short mark of the last publication, undo or removal.

export interface ContentVersionSource {
  /** Different after every publication, undo and piece taken off the site; the same otherwise. */
  current(): Promise<string>;
}

/** For a Worker without one: the routes then answer without a validator, always in full. */
export const NO_CONTENT_VERSION: ContentVersionSource = {
  current: () => Promise.reject(new Error('The content version is not configured')),
};
