import { useEffect } from 'react';
import { Link, Navigate } from 'react-router';
import { History, Play, Search } from 'lucide-react';
import { searchTerm } from '@qv/anki-search';
import type { Counts } from '@qv/srs';
import { paths } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { Skeleton } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { Reserved } from '../../ui/Reserved';
import { button, card, page } from '../../ui/styles';
import { useDeck } from '../decks/queries';
import { DayLoad, useDeckCounts } from '../study/DeckCounts';
import { MasteryMeter } from '../study/MasteryMeter';
import { LONGEST_CATCH_UP, catchUpText } from '../study/pace';
import type { AssessmentView, CatchUp } from '../study/pace';
import { useAssessmentView, usePreferences, useStudyPlan } from '../study/queries';
import { EMPTY_PLAN, HEAVY_LOAD_MINUTES, estimateMinutes } from '../study/simple';
import { AssessmentOptions } from './AssessmentOptions';
import { SimpleDeckTree, visibleChildren } from './SimpleDeckTree';
import { ancestry, deckCrumbs } from './tree';
import type { CourseDeckNode, DeckNode } from './tree';
import type { StudyPlan } from '../study/simple';
import { useCountOpen } from '../usage/count';

/** The text of a deck for the user: a course's deck is the course («Anatomía I»), the others their name. */
export const deckTitle = (n: DeckNode) => (n.depth === 2 && n.course ? n.course.name : n.label);

/** How «Configuración de mazos» names a preset in its URL: an author's by its name, the user's by its id. */

/**
 * A deck's page below a course: an assessment, a week, a deck, its Extras. (The course's own deck is on the
 * course's page.)
 */
export function DeckPage({ node }: { node: CourseDeckNode }) {
  const deck = useDeck(node.id);
  const plan = useStudyPlan();
  // Computing it takes a while with many cards: once here, for the options and the panel.
  const study = useDeckCounts(deck.data);
  const view = useAssessmentView(node.depth === 3 ? node.id : null);

  useEffect(() => {
    document.title = `${node.label} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [node.label]);

  // A week or a lecture is chosen on its assessment's page: there is nothing more inside it.
  const assessment = node.depth > 3 ? ancestry(node).find((n) => n.depth === 3) : null;
  // «Uso» (step 2.9): a deck's page (not one that goes on to its assessment's), its study and its final review are
  // what open a deck.
  useCountOpen('deck', deck.data && !assessment?.ref ? node.id : null);
  if (assessment?.ref) return <Navigate replace to={paths.deck(assessment.ref)} />;

  return (
    <div className={page}>
      <Breadcrumbs items={deckCrumbs(node)} />
      {/* The title right under the breadcrumbs, as on every page (no kicker above it that would push it down); the
          deck's cards beside it. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{deckTitle(node)}</h1>
          <p className="mt-2 text-muted">
            Mazo de Anki · {node.noteCount.toLocaleString('es-CL')}{' '}
            {node.noteCount === 1 ? 'nota' : 'notas'} · {node.cardCount.toLocaleString('es-CL')}{' '}
            {node.cardCount === 1 ? 'tarjeta' : 'tarjetas'}
          </p>
        </div>
        <nav aria-label="Herramientas de Anki" className="flex-none">
          <Link
            to={paths.browse({ q: searchTerm('deck', node.name) })}
            className={`${button.base} ${button.secondary}`}
          >
            <Search className="size-4" aria-hidden="true" /> Ver tarjetas de este mazo
          </Link>
        </nav>
      </div>

      {/* An assessment's options first: how many new cards a day and the date are what a student comes to change.
          The same rows while they load, so that the list below does not jump. */}
      {node.depth === 3 ? <AssessmentOptions node={node} plan={plan.data} view={view} /> : null}

      {deck.isError ? (
        <div className="mt-6">
          <ErrorWithRetry error={deck.error} onRetry={() => void deck.refetch()} />
        </div>
      ) : (
        <DeckStudyPanel node={node} study={study} view={view} />
      )}
    </div>
  );
}

/**
 * The counts of the deck, «Estudiar» and its subdecks with their counts: the load in minutes and the switches, or
 * with «Modo avanzado», Anki's three numbers and its table. While the preferences load it is already the
 * simple one, the default: a student must not see the table (with its Extras) flash by.
 */
function DeckStudyPanel({
  node,
  study,
  view,
}: {
  node: CourseDeckNode;
  study: ReturnType<typeof useDeckCounts>;
  /** An assessment's: its final review and its plan to catch up. */
  view: AssessmentView | null;
}) {
  const { counts, mastery, error, retry } = study;
  const { prefs } = usePreferences();
  const plan = useStudyPlan();
  const own = counts?.get(node.id);
  return (
    <section aria-label="Estudiar" className={`${card} mt-6 p-4 sm:p-6`}>
      {error ? (
        <ErrorWithRetry error={error} onRetry={retry} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to={paths.deckStudy(node.ref)}
              className={`${button.base} ${button.primary} order-1 flex-1 py-3 text-base sm:flex-none sm:px-10`}
            >
              <Play className="size-4" aria-hidden="true" /> Estudiar
            </Link>
            <div
              aria-label="Para hoy"
              role="group"
              // On the phone the load has its own line: however long it gets, nothing wraps differently.
              className="order-3 flex items-center gap-2 font-medium max-sm:basis-full sm:order-2 sm:min-w-[13.5rem]"
            >
              {!own ? (
                <Skeleton className="h-6 w-36" />
              ) : (
                <DayLoad counts={own} medianAnswerMs={plan.data?.medianAnswerMs ?? null} detail />
              )}
            </div>
            <div className="order-4 flex h-5 items-center max-sm:basis-full sm:order-3">
              {mastery ? (
                <MasteryMeter value={mastery.get(node.id) ?? 0} align="left" />
              ) : (
                <Skeleton className="h-4 w-[5.5rem]" />
              )}
            </div>
            {node.depth === 3 ? <FinalReviewLink node={node} view={view} /> : null}
          </div>
          <SimpleDetails
            node={node}
            counts={counts}
            mastery={mastery}
            plan={prefs ? plan.data : undefined}
            catchUp={view?.catchUp ?? null}
          />
        </>
      )}
    </section>
  );
}

/**
 * The way to the final review, always in its place: it only works once something was seen, and it stands out on the
 * last days before the test (same box, other colors).
 */
function FinalReviewLink({ node, view }: { node: CourseDeckNode; view: AssessmentView | null }) {
  const className = `${button.base} ${
    view?.reviewDays && view.facts.seen > 0
      ? 'border border-brand bg-brand-soft px-4 py-2.5 text-brand'
      : button.secondary
  } order-2 sm:order-4 sm:ml-auto`;
  const content = (
    <>
      <History className="size-4" aria-hidden="true" /> Repaso final
    </>
  );
  return view && view.facts.seen > 0 ? (
    <Link to={paths.deckReview(node.ref)} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      disabled
      className={className}
      title="Se activa cuando hayas visto tarjetas"
    >
      {content}
    </button>
  );
}

/**
 * Below «Estudiar», the simple way: the switch of its week or lecture and what is below. What depends on the data
 * waits with a skeleton in its place, and what could appear late goes under the list.
 */
function SimpleDetails({
  node,
  counts,
  mastery,
  plan,
  catchUp,
}: {
  node: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  mastery: Map<string, number> | undefined;
  plan: StudyPlan | undefined;
  catchUp: CatchUp | null;
}) {
  const own = counts?.get(node.id);
  const known = plan ?? EMPTY_PLAN;
  const minutes = own ? estimateMinutes(own, known.medianAnswerMs) : 0;
  return (
    <>
      {/* A large backlog takes its place: it says what matters more, and nothing moves. */}
      <Reserved longest={LONGEST_CATCH_UP} className="mt-3 text-sm text-muted">
        {catchUp ? (
          <p role="status" className="font-medium text-state-learn">
            {catchUpText(catchUp)}
          </p>
        ) : (
          <p>Activa lo que estás viendo en clases: cada semana o clase parte desactivada.</p>
        )}
      </Reserved>
      {visibleChildren(node, known).length ? (
        <div className="mt-5">
          <SimpleDeckTree
            root={node}
            counts={counts}
            plan={plan}
            mastery={mastery}
            label="Submazos"
          />
        </div>
      ) : null}
      {/* Its line is always reserved, so that the options below do not jump when the load grows. */}
      <p
        className={`mt-3 text-sm text-muted ${minutes >= HEAVY_LOAD_MINUTES ? '' : 'invisible'}`}
        aria-hidden={minutes < HEAVY_LOAD_MINUTES}
      >
        Es bastante para un día. Puedes parar cuando quieras: lo que no alcances sale mañana.
      </p>
    </>
  );
}
