// What to tell about a failure: its own message when it is an `Error`, and `fallback` for anything else. It lives
// outside the hooks that catch because a conditional inside `catch` keeps React Compiler from compiling them.
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
