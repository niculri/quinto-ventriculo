// A fresh nonce for each sign-in with Google's button: Google gets its SHA-256 and Supabase the raw value to compare.

export interface Nonce {
  raw: string;
  hashed: string;
}

/** The lowercase hex of the SHA-256 of `text`, the form Supabase Auth hashes the nonce to before comparing. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function newNonce(): Promise<Nonce> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { raw, hashed: await sha256Hex(raw) };
}
