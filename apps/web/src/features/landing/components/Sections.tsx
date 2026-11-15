// The landing page's sections: what is inside the site, what is coming and how it is used.
import {
  BookOpenText,
  Brain,
  ChartNoAxesColumn,
  FolderTree,
  ListChecks,
  Pin,
  ScrollText,
} from 'lucide-react';
import { HowToUse } from '../../help/HowToUse';
import { Feature } from './Feature';
import { landingStrings as s } from '../strings';

export function Inside() {
  return (
    <section className="border-y border-border bg-surface" aria-labelledby="whats-inside">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="whats-inside" className="font-serif text-3xl font-semibold tracking-tight">
          {s.inside.title}
        </h2>
        <p className="mt-3 max-w-2xl text-muted">{s.inside.lead}</p>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature Icon={BookOpenText} title={s.inside.notes.title}>
            {s.inside.notes.text}
          </Feature>
          <Feature Icon={Brain} title={s.inside.cards.title}>
            {s.inside.cards.text}
          </Feature>
          <Feature Icon={ListChecks} title={s.inside.tests.title}>
            {s.inside.tests.text}
          </Feature>
          <Feature Icon={FolderTree} title={s.inside.career.title}>
            {s.inside.career.text}
          </Feature>
        </ul>

        <h2 id="coming-soon" className="mt-16 font-serif text-3xl font-semibold tracking-tight">
          {s.coming.title}
        </h2>
        <p className="mt-3 max-w-2xl text-muted">{s.coming.lead}</p>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature Icon={Pin} title={s.coming.gymkana.title} soon>
            {s.coming.gymkana.text}
          </Feature>
          <Feature Icon={ChartNoAxesColumn} title={s.coming.stats.title} soon>
            {s.coming.stats.text}
          </Feature>
          <Feature Icon={ScrollText} title={s.coming.summaries.title} soon>
            {s.coming.summaries.text}
          </Feature>
        </ul>
      </div>
    </section>
  );
}

export function HowItIsUsed() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-to-use">
      <h2 id="how-to-use" className="font-serif text-3xl font-semibold tracking-tight">
        {s.howTo}
      </h2>
      <div className="mt-8">
        <HowToUse />
      </div>
    </section>
  );
}
