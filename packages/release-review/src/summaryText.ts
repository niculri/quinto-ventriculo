// Small readings of a release summary that the checks and the panel share: names and a finding's detail.
import type { ReleaseFinding, ReleaseSummary } from '@qv/schema/release';

export const assessmentName = (s: ReleaseSummary, id: string | null) => {
  const a = s.assessments.find((x) => x.id === id);
  return a ? `${a.courseName ?? a.courseId ?? ''} · ${a.name ?? a.id}` : (id ?? '');
};

export const detail = (f: ReleaseFinding, k: string) => {
  const v = f.detail[k];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
};

export const lastName = (deckName: string) => deckName.split('::').at(-1)!;
