// Reading the clock where a component renders. The compiler reuses the result of a call whose arguments did not change,
// so the reading names what makes it new: what is counted from it is counted again with the time of then.

/** The time now in milliseconds, read again whenever one of `causes` changes. */
export function readClock(..._causes: readonly unknown[]): number {
  return Date.now();
}
