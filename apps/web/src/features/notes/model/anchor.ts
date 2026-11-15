// The section a URL's hash points to: without a text fragment the browser left in it, and decoded when it can be.
export function anchorOf(hash: string): string | null {
  let id = hash.slice(1);
  // Browsers that do not take a text fragment («:~:text=…») out of the hash leave it here.
  const directive = id.indexOf(':~:');
  if (directive >= 0) id = id.slice(0, directive);
  if (!id) return null;
  try {
    id = decodeURIComponent(id);
  } catch {
    // a lone «%»: looked up as is
  }
  return id;
}
