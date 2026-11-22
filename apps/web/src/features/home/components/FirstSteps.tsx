// «Primeros pasos» on the home page: choose courses, turn on a week or class, answer a card; only the next one says
// what to do and offers its button.

import type { ReactNode } from 'react';
import { Check, Play } from 'lucide-react';
import { Link } from 'react-router';
import { button, card } from '../../../shared/ui/styles';
import { nextStep } from '../model/firstSteps';
import type { Steps } from '../model/firstSteps';
import { firstStepsStrings as s } from './strings/FirstSteps.strings';
import { HashOrLink } from './HashOrLink';

function Step({
  done,
  n,
  next,
  title,
  text,
  action,
}: {
  done: boolean;
  n: number;
  next: number;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={`flex size-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-brand text-white dark:text-[#0a1316]' : 'bg-brand-soft text-brand'}`}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-sm:basis-full sm:flex-1">
          <p className={`font-medium ${done ? 'text-muted line-through' : ''}`}>
            {title}
            <span className="sr-only">{done ? s.steps.done : s.steps.pending}</span>
          </p>
          {n === next ? <p className="mt-0.5 text-sm text-muted">{text}</p> : null}
        </div>
        {n === next && action ? <div className="flex-none">{action}</div> : null}
      </div>
    </li>
  );
}

const stepLink = (to: string, label: string) => (
  <HashOrLink to={to} className={`${button.base} ${button.secondary} py-2`}>
    {label}
  </HashOrLink>
);

export function FirstSteps({
  steps,
  onHide,
  choose,
  study,
}: {
  steps: Steps;
  onHide: () => void;
  choose: string;
  study: string | null;
}) {
  const next = nextStep(steps);
  return (
    <section className={`${card} mt-6 p-4 sm:mt-8 sm:p-6`} aria-labelledby="first-steps">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="first-steps" className="font-serif text-xl font-semibold">
          {s.steps.title}
        </h2>
        <button
          type="button"
          className={`${button.base} ${button.ghost} -my-2 -mr-2`}
          onClick={onHide}
        >
          {s.steps.hide}
        </button>
      </div>
      <ol className="mt-1 divide-y divide-border">
        <Step
          done={steps.course}
          n={1}
          next={next}
          title={s.steps.course.title}
          text={s.steps.course.text}
          action={next === 1 ? stepLink('#tus-ramos', s.steps.course.action) : null}
        />
        <Step
          done={steps.unit}
          n={2}
          next={next}
          title={s.steps.unit.title}
          text={s.steps.unit.text}
          action={next === 2 ? stepLink(choose, s.steps.unit.action) : null}
        />
        <Step
          done={steps.card}
          n={3}
          next={next}
          title={s.steps.card.title}
          text={s.steps.card.text}
          action={
            next === 3 && study ? (
              <Link to={study} className={`${button.base} ${button.primary} py-2`}>
                <Play className="size-4" aria-hidden="true" /> {s.steps.card.action}
              </Link>
            ) : null
          }
        />
      </ol>
    </section>
  );
}
