// The gymkana as an Anki deck: its switch (a unit of the assessment, like a week), studying it and its cards.
import { Link } from 'react-router';
import { activeUnits } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { Switch } from '../../../shared/ui/Switch';
import { button, card } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useSetActivation, useStudyPlan } from '../../progress/queries';
import { ankiBlockStrings as s } from './strings/AnkiBlock.strings';

export function AnkiBlock({ node }: { node: CourseDeckNode }) {
  const plan = useStudyPlan();
  const activate = useSetActivation();
  const on = plan.data ? activeUnits([node], plan.data).has(node.id) : false;
  return (
    <section className={`${card} mt-4 p-4 sm:p-6`} aria-labelledby="gymkana-anki">
      <h2 id="gymkana-anki" className="text-lg font-semibold">
        {s.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{s.text}</p>
      <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 text-sm font-medium">
        {s.on}
        <Switch
          label={s.on}
          checked={on}
          disabled={!plan.data}
          onChange={(active) => activate.mutate({ deckId: node.id, active })}
        />
      </label>
      {activate.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {s.failed}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={paths.deckStudy(node.ref)} className={`${button.base} ${button.primary}`}>
          {s.study}
        </Link>
        <Link to={paths.cards(node.ref)} className={`${button.base} ${button.secondary}`}>
          {s.seeStations}
        </Link>
      </div>
    </section>
  );
}
