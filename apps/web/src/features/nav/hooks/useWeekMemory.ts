// The weeks of the menu opened or closed by hand, kept above the menu so that going to another page, or opening the
// phone's drawer again, does not forget them.
import { createContext, use } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { NO_WEEKS } from '../model/weeks';
import type { WeekMemory } from '../model/weeks';

export const WeekMemoryContext = createContext<
  readonly [WeekMemory, Dispatch<SetStateAction<WeekMemory>>]
>([NO_WEEKS, () => undefined]);

export const useWeekMemory = () => use(WeekMemoryContext);
