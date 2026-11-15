// The home page's sections in order: first steps (until done or hidden), «Hoy», «Seguir», the heatmap, «Tus ramos»
// and a line to the whole career.

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import type { Catalog } from '@qv/schema';
import type { StudyPlan } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import type { StudyPreferences } from '../../progress/api/repository';
import { Heatmap } from '../../stats/components/Heatmap';
import { useHomeSections } from '../hooks/useHomeSections';
import { hideFirstSteps } from '../model/firstSteps';
import type { OpenRound } from '../model/follow';
import { homeStrings as s } from '../strings';
import { FirstSteps } from './FirstSteps';
import { Follow } from './Follow';
import { MyCourses } from './MyCourses';
import { Today } from './Today';

export function Sections({
  catalog,
  prefs: saved,
  plan,
  rounds,
}: {
  catalog: Catalog;
  prefs: StudyPreferences;
  plan: StudyPlan;
  rounds: readonly OpenRound[];
}) {
  const { save, shown, today, mine, choose, steps, showSteps } = useHomeSections(
    catalog,
    saved,
    plan,
  );
  return (
    <>
      {showSteps ? (
        <FirstSteps
          steps={steps}
          onHide={() => save(hideFirstSteps(shown))}
          choose={choose}
          study={today[0] ? paths.deckStudy(today[0].ref) : null}
        />
      ) : null}
      <Today catalog={catalog} courses={today} choose={choose} />
      <Follow catalog={catalog} rounds={rounds} />
      {catalog.anki.decks.length ? (
        <Heatmap
          scope="all"
          deckIds={null}
          catalog={catalog}
          groupBy="course"
          className="mt-6 sm:mt-8"
        />
      ) : null}
      <MyCourses catalog={catalog} prefs={shown} courses={mine} onChange={save} />
      <p className="mt-6 sm:mt-8">
        <Link
          to={paths.courses}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          {s.career} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </p>
    </>
  );
}
