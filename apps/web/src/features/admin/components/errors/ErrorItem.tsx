// One error of «Errores»: what happened, how many times and when, to whom, where, in which deploy, system, browser and
// window, its stack, and a button that copies all of it for Claude (with «alumno A» instead of who).
import type { ReactNode } from 'react';
import type { ClientErrorGroup } from '@qv/schema';
import type { AccountLabel } from '../../api/repository';
import {
  claudeText,
  environment,
  otherEnvironments,
  personName,
  when,
  windowText,
} from '../../model/clientErrors';
import { clientErrorsStrings as e } from '../../model/strings/clientErrors.strings';
import { CopyButton } from '../reports/CopyButton';
import { errorItemStrings as s } from './strings/ErrorItem.strings';

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function peopleText(g: ClientErrorGroup, labels: readonly AccountLabel[]): string {
  const names = g.accounts.map((id) => personName(id, labels));
  const more = g.people - names.length;
  const who = names.length ? [...names, ...(more > 0 ? [e.more(more)] : [])].join(', ') : s.nobody;
  return g.anonymous ? `${who} · ${s.withoutSession(e.times(g.anonymous))}` : who;
}

export function ErrorItem({
  group: g,
  days,
  labels,
}: {
  group: ClientErrorGroup;
  days: number;
  labels: readonly AccountLabel[];
}) {
  const others = otherEnvironments(g);
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{e.kinds[g.kind]}</h3>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {e.times(g.count)} · {e.people(g.people)} · {s.last(when(g.lastSeen))}
          </p>
        </div>
        <CopyButton text={claudeText(g, days)} label={s.copy} />
      </div>
      {g.message ? <p className="mt-2 text-sm break-words">{g.message}</p> : null}
      <dl className="mt-3 space-y-1 text-sm">
        <Row term={s.people}>{peopleText(g, labels)}</Row>
        <Row term={s.page}>
          <span className="font-mono text-xs break-all">{g.page}</span>
        </Row>
        <Row term={s.version}>
          <span className="font-mono text-xs">{g.version || e.noVersion}</span>
        </Row>
        <Row term={s.environment}>{environment(g.os, g.browser)}</Row>
        {others ? <Row term={s.others}>{others}</Row> : null}
        <Row term={s.window}>{windowText(g)}</Row>
        <Row term={s.first}>{when(g.firstSeen)}</Row>
      </dl>
      {g.stack ? (
        <div className="mt-3">
          <p className="text-sm text-muted">{s.stack}</p>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed">
            {g.stack}
          </pre>
        </div>
      ) : null}
    </li>
  );
}
