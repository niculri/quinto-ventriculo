// The data of a Supabase answer, or the error of the content database that came instead.
export function unwrap<T>(
  r: { data: T; error: null } | { data: null; error: { message: string } },
  what: string,
): T {
  if (r.error) throw new Error(`Content database (${what}): ${r.error.message}`);
  return r.data;
}
