// Keeps the weeks of the menu opened or closed by hand for both menus (the one on the left and the phone's drawer)
// while the pages stay in the same assessment: arriving at another one forgets them.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAnkiTree } from '../../catalog/hooks/useAnkiTree';
import { locate } from '../model/where';
import { NO_WEEKS } from '../model/weeks';
import { WeekMemoryContext } from '../hooks/useWeekMemory';

export function WeekMemoryProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { catalog, tree } = useAnkiTree();
  const here = locate(pathname, catalog.data ?? null, tree).assessmentId;
  const [weeks, setWeeks] = useState(NO_WEEKS);
  if (weeks.assessmentId !== here) setWeeks({ assessmentId: here, toggled: {} });
  return <WeekMemoryContext value={[weeks, setWeeks]}>{children}</WeekMemoryContext>;
}
