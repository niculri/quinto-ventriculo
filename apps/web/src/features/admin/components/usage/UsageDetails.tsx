// The details of «Uso» in 30 days: the most used decks, tests, openings and searches; by course and assessment;
// activation and the invited. While they come, the same headings with skeletons.
import { Link } from 'react-router';
import type { Catalog, UsageReport } from '@qv/schema';
import { paths } from '../../../../shared/lib/paths';
import { Skeleton } from '../../../../shared/ui/Loading';
import { card } from '../../../../shared/ui/styles';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { findCourse } from '../../../catalog/model/catalog';
import { deckNamed, figure, noteNamed, quizNamed } from '../../model/usage';
import { usageDetailsStrings } from './strings/UsageDetails.strings';
import { usageStrings } from '../../model/strings/usage.strings';
import { Pairs, UsageTable } from './UsageTable';
import type { UsageRow } from './UsageTable';

/** The first heading has the real one's id, so the e2e test follows it from the first frame. */
export function DetailsLoading() {
  return (
    <div className="mt-8 min-h-[40rem]">
      {[
        usageDetailsStrings.details.top,
        usageDetailsStrings.details.courses,
        usageDetailsStrings.details.activation,
        usageDetailsStrings.details.invited,
      ].map((t, i) => (
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
          {usageDetailsStrings.details.courses}
        </h3>
        <div className="mt-3">
          <UsageTable
            title={usageDetailsStrings.details.coursesTable}
            hideTitle
            empty={usageDetailsStrings.details.noCourses}
            columns={usageDetailsStrings.details.courseColumns}
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
        {usageDetailsStrings.details.top}
      </h3>
      <p className="mt-1 text-sm text-muted">{usageDetailsStrings.details.topHelp}</p>
      <div className="mt-3 grid gap-4">
        <UsageTable
          title={usageDetailsStrings.details.decks}
          empty={usageDetailsStrings.details.noDecks}
          columns={usageDetailsStrings.details.deckColumns}
          rows={report.decks.map((d) => ({
            key: d.deckId,
            named: deckNamed(tree, d.deckId),
            values: [figure(d.students, true), figure(d.answers), figure(d.newCards)],
          }))}
        />
        <UsageTable
          title={usageDetailsStrings.details.tests}
          empty={usageDetailsStrings.details.noTests}
          columns={usageDetailsStrings.details.testColumns}
          rows={report.quizzes.map((q) => ({
            key: q.quizId,
            named: quizNamed(catalog, q.quizId),
            values: [figure(q.students, true), figure(q.roundsStarted), figure(q.roundsFinished)],
          }))}
        />
        {opens ? (
          <>
            <UsageTable
              title={usageDetailsStrings.details.opened}
              empty={usageDetailsStrings.details.noOpened}
              columns={usageDetailsStrings.details.openedColumns}
              rows={opens.top.map((t) => ({
                key: `${t.kind}:${t.id}`,
                named:
                  t.kind === 'note'
                    ? noteNamed(catalog, t.id)
                    : t.kind === 'deck'
                      ? deckNamed(tree, t.id)
                      : quizNamed(catalog, t.id),
                values: [usageDetailsStrings.details.kinds[t.kind], figure(t.opens)],
              }))}
            />
            <UsageTable
              title={usageDetailsStrings.details.searches}
              empty={usageDetailsStrings.details.noSearches}
              columns={usageDetailsStrings.details.searchColumns}
              rows={opens.searches.map((x) => ({
                key: x.context,
                named: { name: usageDetailsStrings.contexts[x.context], detail: null, to: null },
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
          {usageDetailsStrings.details.activation}
        </h3>
        <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
          <p className="font-serif text-3xl font-semibold tabular-nums">
            {report.activation.percent === null
              ? usageStrings.none
              : usageDetailsStrings.details.percent(report.activation.percent)}
          </p>
          <p className="mt-1 text-sm text-muted">{usageDetailsStrings.details.activated}</p>
          <Pairs
            items={[
              [usageDetailsStrings.details.eligible, figure(report.activation.eligible, true)],
              [usageDetailsStrings.details.inTime, figure(report.activation.activated, true)],
              [usageDetailsStrings.details.notInTime, figure(report.activation.notActivated, true)],
            ]}
          />
        </div>
      </section>
      <section aria-labelledby="usage-invited">
        <h3 id="usage-invited" className="text-lg font-semibold">
          {usageDetailsStrings.details.invited}
        </h3>
        <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
          <Pairs
            items={[
              [usageDetailsStrings.details.signedIn, figure(report.invited.signedIn, true)],
              [usageDetailsStrings.details.never, figure(report.invited.never, true)],
            ]}
          />
          <p className="mt-3 text-sm text-muted">
            {usageDetailsStrings.details.whoBefore}{' '}
            <Link to={paths.adminAccess} className="text-brand underline underline-offset-2">
              {usageDetailsStrings.details.access}
            </Link>
            {usageDetailsStrings.details.end}
          </p>
        </div>
      </section>
    </div>
  );
}
