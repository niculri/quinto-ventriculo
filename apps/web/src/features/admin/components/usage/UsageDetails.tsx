// The details of «Uso» in 30 days: the most used decks, tests, openings and searches; by course and assessment;
// activation and the invited. While they come, the same headings with skeletons.
import { Link } from 'react-router';
import type { Catalog, UsageReport } from '@qv/schema';
import { paths } from '../../../../shared/lib/paths';
import { Skeleton } from '../../../../shared/ui/Loading';
import { card } from '../../../../shared/ui/styles';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { findCourse } from '../../../catalog/queries';
import { deckNamed, figure, noteNamed, quizNamed } from '../../model/usage';
import { usageStrings } from '../../usage.strings';
import { Pairs, UsageTable } from './UsageTable';
import type { UsageRow } from './UsageTable';

const s = usageStrings.details;

/** The first heading has the real one's id, so the e2e test follows it from the first frame. */
export function DetailsLoading() {
  return (
    <div className="mt-8 min-h-[40rem]">
      {[s.top, s.courses, s.activation, s.invited].map((t, i) => (
        <section key={t} className="mt-8 first:mt-0">
          <h3 id={i === 0 ? 'usage-top' : undefined} className="text-lg font-semibold">
            {t}
          </h3>
          <div className={`${card} mt-3 space-y-3 px-4 py-4 sm:px-5`}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </section>
      ))}
    </div>
  );
}

export function UsageDetails({ report, catalog }: { report: UsageReport; catalog: Catalog }) {
  return (
    <>
      <TopUsed report={report} catalog={catalog} />
      <section aria-labelledby="usage-courses" className="mt-8">
        <h3 id="usage-courses" className="text-lg font-semibold">
          {s.courses}
        </h3>
        <div className="mt-3">
          <UsageTable
            title={s.coursesTable}
            hideTitle
            empty={s.noCourses}
            columns={s.courseColumns}
            rows={courseRows(report, catalog)}
          />
        </div>
      </section>
      <ActivationAndInvited report={report} />
    </>
  );
}

function TopUsed({ report, catalog }: { report: UsageReport; catalog: Catalog }) {
  const tree = buildAnkiTree(catalog);
  const opens = report.opens;
  return (
    <section aria-labelledby="usage-top" className="mt-8">
      <h3 id="usage-top" className="text-lg font-semibold">
        {s.top}
      </h3>
      <p className="mt-1 text-sm text-muted">{s.topHelp}</p>
      <div className="mt-3 grid gap-4">
        <UsageTable
          title={s.decks}
          empty={s.noDecks}
          columns={s.deckColumns}
          rows={report.decks.map((d) => ({
            key: d.deckId,
            named: deckNamed(tree, d.deckId),
            values: [figure(d.students, true), figure(d.answers), figure(d.newCards)],
          }))}
        />
        <UsageTable
          title={s.tests}
          empty={s.noTests}
          columns={s.testColumns}
          rows={report.quizzes.map((q) => ({
            key: q.quizId,
            named: quizNamed(catalog, q.quizId),
            values: [figure(q.students, true), figure(q.roundsStarted), figure(q.roundsFinished)],
          }))}
        />
        {opens ? (
          <>
            <UsageTable
              title={s.opened}
              empty={s.noOpened}
              columns={s.openedColumns}
              rows={opens.top.map((t) => ({
                key: `${t.kind}:${t.id}`,
                named:
                  t.kind === 'note'
                    ? noteNamed(catalog, t.id)
                    : t.kind === 'deck'
                      ? deckNamed(tree, t.id)
                      : quizNamed(catalog, t.id),
                values: [s.kinds[t.kind], figure(t.opens)],
              }))}
            />
            <UsageTable
              title={s.searches}
              empty={s.noSearches}
              columns={s.searchColumns}
              rows={opens.searches.map((x) => ({
                key: x.context,
                named: { name: usageStrings.contexts[x.context], detail: null, to: null },
                values: [figure(x.count)],
              }))}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

function courseRows(report: UsageReport, catalog: Catalog): UsageRow[] {
  return report.courses.flatMap((c) => {
    const found = findCourse(catalog, c.courseId);
    const course = found?.course ?? null;
    return [
      {
        key: c.courseId,
        named: {
          name: course?.name ?? c.courseId,
          detail: null,
          to: course ? paths.course(course) : null,
        },
        values: [figure(c.students, true), figure(c.ankiAnswers), figure(c.roundsStarted)],
      },
      ...report.assessments
        .filter((a) => a.courseId === c.courseId)
        .map((a) => {
          const assessment = course?.assessments.find((x) => x.id === a.assessmentId);
          return {
            key: a.assessmentId,
            indent: true,
            named: {
              name: assessment?.name ?? a.assessmentId,
              detail: null,
              to: course ? paths.assessment(course, a.assessmentId) : null,
            },
            values: [figure(a.students, true), figure(a.ankiAnswers), figure(a.roundsStarted)],
          };
        }),
    ];
  });
}

function ActivationAndInvited({ report }: { report: UsageReport }) {
  return (
    <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-4">
      <section aria-labelledby="usage-activation">
        <h3 id="usage-activation" className="text-lg font-semibold">
          {s.activation}
        </h3>
        <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
          <p className="font-serif text-3xl font-semibold tabular-nums">
            {report.activation.percent === null
              ? usageStrings.none
              : s.percent(report.activation.percent)}
          </p>
          <p className="mt-1 text-sm text-muted">{s.activated}</p>
          <Pairs
            items={[
              [s.eligible, figure(report.activation.eligible, true)],
              [s.inTime, figure(report.activation.activated, true)],
              [s.notInTime, figure(report.activation.notActivated, true)],
            ]}
          />
        </div>
      </section>
      <section aria-labelledby="usage-invited">
        <h3 id="usage-invited" className="text-lg font-semibold">
          {s.invited}
        </h3>
        <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
          <Pairs
            items={[
              [s.signedIn, figure(report.invited.signedIn, true)],
              [s.never, figure(report.invited.never, true)],
            ]}
          />
          <p className="mt-3 text-sm text-muted">
            {s.whoBefore}{' '}
            <Link to={paths.adminAccess} className="text-brand underline underline-offset-2">
              {s.access}
            </Link>
            {s.end}
          </p>
        </div>
      </section>
    </div>
  );
}
