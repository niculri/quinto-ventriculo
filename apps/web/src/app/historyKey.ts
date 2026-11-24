// Gives the first entry of a tab's history a key of its own, as the router gives the others: without one the router
// calls it «default», and a new visit typed in the address bar would come back to what another page kept for it.

/** The router's own form of key. */
const newKey = () => Math.random().toString(36).slice(2, 10);

export function keyFirstEntry(history: Pick<History, 'state' | 'replaceState'>, key = newKey) {
  const state: unknown = history.state;
  const kept = state !== null && typeof state === 'object' ? state : {};
  if ('key' in kept) return;
  history.replaceState({ ...kept, key: key() }, '');
}
