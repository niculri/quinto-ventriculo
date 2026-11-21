// Tests the clock reading: it is the time now, whatever the causes it is given.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readClock } from '../clock';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});
afterEach(() => vi.useRealTimers());

it('is the time now, read each time it is called', () => {
  expect(readClock()).toBe(1_000);
  vi.setSystemTime(2_500);
  expect(readClock('a', 3)).toBe(2_500);
});
