// Tests the weeks' memory outside its provider: nothing opened by hand, and opening one is not kept.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NO_WEEKS } from '../../model/weeks';
import { useWeekMemory } from '../useWeekMemory';

describe('the weeks of the menu without their provider', () => {
  it('keeps nothing', () => {
    const { result } = renderHook(() => useWeekMemory());
    act(() => result.current[1]({ assessmentId: 'a/c1', toggled: {} }));
    expect(result.current[0]).toBe(NO_WEEKS);
  });
});
