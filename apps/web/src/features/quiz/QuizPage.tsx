import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { isAnswered, progress, score } from '@qv/quiz';
import { QUIZ_THEME_TOKENS } from '@qv/schema';
import type { QuizDetail, QuizSectionDetail, QuizSectionSummary } from '@qv/schema';
import { paths } from '../../app/paths';
import type { CourseRef } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { Canonical } from '../catalog/Redirects';
import { findCourse, useCatalog } from '../catalog/queries';
import { ImageViewer } from '../notes/ImageViewer';
import type { OpenImage } from '../notes/ImageViewer';
import { Cover } from './Cover';
import { Html } from './Figures';
import { QuestionCard } from './QuestionCard';
import { Results } from './Results';
import { useQuizDetail, useQuizSection, useSavedQuiz } from './queries';
import type { SavedQuiz } from './repository';
import { useQuizSession } from './useQuizSession';
import type { QuestionEntry } from './useQuizSession';
import { ReportDialog } from '../reports/ReportDialog';
import { plainText } from '../reports/labels';
import type { ReportTarget } from '../reports/repository';
import { useFocusMode } from '../../ui/focus';
import './quiz.css';

/** The tab last opened in this browser (a convenience: the URL is what says the tab). */
const tabKey = (quizId: string) => `qv-quiz-tab:${quizId}`;
function rememberTab(quizId: string, sectionId: string) {
  try {
    localStorage.setItem(tabKey(quizId), sectionId);
  } catch {
    // blocked storage: the tab is not remembered
  }
}

/**
 * The section to open when the URL does not say: the tab last opened in this browser, or the one with the
 * latest saved step (another device), or the first.
 */
function lastUsed(quiz: QuizDetail, saved: SavedQuiz): string {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(tabKey(quiz.id));
  } catch {
    remembered = null;
  }
  if (remembered && quiz.sections.some((s) => s.id === remembered)) return remembered;
  let best: { id: string; at: string } | null = null;
  for (const s of quiz.sections) {
    const at = saved[s.id]?.updatedAt;
    if (at && (!best || at > best.at)) best = { id: s.id, at };
  }
  return best?.id ?? quiz.sections[0]!.id;
}

/** The course's colors of the test («tema»), as CSS variables for quiz.css. */
function themeStyle(quiz: QuizDetail): CSSProperties {
  const style: Record<string, string> = {};
  for (const t of QUIZ_THEME_TOKENS) {
    style[`--t-${t}-l`] = quiz.theme.light[t] ?? '';
    style[`--t-${t}-d`] = quiz.theme.dark[t] ?? '';
  }
  return style as CSSProperties;
}

/**
 * A practice test: `/semesters/:n/courses/:courseId/tests/:assessment/:quizSlug[/:sectionId]` (the slug is
 * unique in its assessment). A test with several sections (tabs) has its tab in the URL; without one, it
 * goes to the last one used.
 */
export function QuizPage() {
  const {
    courseId = '',
    number = '',
    assessment: assessmentSegment = '',
    quizSlug = '',
    sectionId,
  } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  // «Ponte a prueba» of an article: the cover with that lecture's topics chosen. Read once (the screen keeps
  // it); the URL loses it so that a reload in the middle of a round does not go back to the cover.
  // Only for the tab it came with: another tab's groups with the same ids are other topics.
  const [arrival, setArrival] = useState(() => {
    const topics = search.get('topics')?.split(',').filter(Boolean);
    return topics?.length ? { section: sectionId ?? null, topics } : null;
  });
  // Leaving that tab forgets them (going back to it does not choose them again).
  if (arrival && (sectionId ?? null) !== arrival.section) setArrival(null);
  useEffect(() => {
    if (search.has('topics')) {
      const rest = new URLSearchParams(search);
      rest.delete('topics');
      const text = rest.toString();
      void navigate(
        { pathname: location.pathname, search: text ? `?${text}` : '', hash: location.hash },
        { replace: true, state: location.state },
      );
    }
  }, [search, navigate, location]);
  const catalog = useCatalog();
  // The test, by where it is in the catalog: its id is what the API and the progress know.
  const found = catalog.data ? findCourse(catalog.data, courseId) : null;
  const summary =
    found?.course.assessments
      .find((a) => a.id === `${courseId}/${assessmentSegment}`)
      ?.quizzes.find((q) => q.slug === quizSlug) ?? null;
  const quiz = useQuizDetail(summary?.id ?? null);
  const saved = useSavedQuiz(quiz.data?.id ?? null);
  const sections = quiz.data?.sections ?? [];
  const active: QuizSectionSummary | null =
    sections.length === 1 ? sections[0]! : (sections.find((s) => s.id === sectionId) ?? null);
  const detail = useQuizSection(quiz.data?.id ?? null, active?.id ?? null);

  // A refetch that fails (the section's, to renew its photos) leaves what was there: the round goes on.
  for (const q of [catalog, quiz, saved, detail]) {
    if (q.isError && q.data === undefined) {
      return <ErrorWithRetry error={q.error} onRetry={() => void q.refetch()} />;
    }
  }
  if (!catalog.data) return <Loading />;
  if (!found || !summary) return <NotFoundPage />;
  if (!quiz.data || !saved.data) return <Loading />;
  const data = quiz.data;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.quiz(course, data, sectionId)} />;
  }
  // One section: no segment for it. Several: the URL says which (or the last one used).
  if (sections.length === 1 && sectionId) return <Canonical path={paths.quiz(course, data)} />;
  if (sections.length > 1 && !sectionId) {
    return <Canonical path={paths.quiz(course, data, lastUsed(data, saved.data))} />;
  }
  if (!active) return <NotFoundPage />;
  if (!detail.data) return <Loading />;
  const assessment = course.assessments.find((a) => a.id === data.assessmentId);

  return (
    <div className="quiz pb-4" style={themeStyle(data)}>
      <QuizScreen
        // Each section has its own round: another tab is another screen.
        key={active.id}
        quiz={data}
        section={active}
        detail={detail.data}
        course={course}
        assessment={assessment ? { id: assessment.id, name: assessment.name } : null}
        saved={saved.data}
        fromTab={(location.state as QuizState | null)?.fromTab === true}
        inRound={(location.state as QuizState | null)?.inRound === true}
        topics={arrival && (sectionId ?? null) === arrival.section ? arrival.topics : null}
        crumbs={
          <div className="wrap wide qz-crumbs">
            <Breadcrumbs
              items={[
                { label: 'Inicio', to: paths.home },
                { label: semester.name, to: paths.semester(semester.number) },
                { label: course.name, to: paths.course(course) },
                ...(assessment
                  ? [
                      { label: assessment.name, to: paths.assessment(course, assessment.id) },
                      // With a single test there is no list of tests to go back to.
                      ...(assessment.quizzes.length > 1
                        ? [{ label: 'Tests', to: paths.assessmentTests(course, assessment.id) }]
                        : []),
                    ]
                  : []),
                { label: data.title },
              ]}
            />
          </div>
        }
      />
    </div>
  );
}

/**
 * What the test's history entry remembers: `fromTab`, that it was opened from a tab of its cover; `inRound`,
 * that a round was on screen (a reload or «back» returns to it; a link to the test opens its cover).
 */
interface QuizState {
  fromTab?: boolean;
  inRound?: boolean;
}

function QuizScreen({
  quiz,
  section,
  detail,
  course,
  assessment,
  saved,
  fromTab,
  inRound,
  topics,
  crumbs,
}: {
  quiz: QuizDetail;
  section: QuizSectionSummary;
  detail: QuizSectionDetail;
  course: CourseRef & { name: string; emoji: string };
  /** The assessment the test is from (its own link in the top bar), if the catalog has it. */
  assessment: { id: string; name: string } | null;
  saved: SavedQuiz;
  fromTab: boolean;
  /** The page is reloaded (or returned to) in the middle of a round: it goes on there. */
  inRound: boolean;
  /** Groups to choose on the cover (arriving from an article's «Ponte a prueba»). */
  topics?: readonly string[] | null;
  crumbs: React.ReactNode;
}) {
  const navigate = useNavigate();
  const session = useQuizSession({
    quizId: quiz.id,
    section: detail,
    saved: saved[section.id],
    // Arriving from a link (the menu, the course, an article…), always the cover with its topics (a round half
    // done offers «Continuar» there); only a reload in the middle of a round goes back to the question.
    showCover: fromTab || !inRound,
    topics: topics ?? null,
  });
  const { round, preferences, current, entries, actions } = session;
  const screen = round?.screen ?? 'cover';
  // Answering, the site's menu goes away (as everything else that is not the question).
  useFocusMode(screen === 'question');
  // While answering, this history entry remembers it (for a reload); the URL does not change.
  const location = useLocation();
  useEffect(() => {
    const state = (location.state as QuizState | null) ?? {};
    if (screen === 'question' && !state.inRound) {
      void navigate(location, {
        replace: true,
        preventScrollReset: true,
        state: { ...state, fromTab: false, inRound: true },
      });
    }
  }, [screen, location, navigate]);
  const [zoom, setZoom] = useState<OpenImage | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Step 2.6: «Reportar error» of a question (answered, or of the finished round), and the thanks after it.
  const [reporting, setReporting] = useState<QuestionEntry | null>(null);
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    if (!thanks) return;
    const id = setTimeout(() => setThanks(false), 3000);
    return () => clearTimeout(id);
  }, [thanks]);
  const reportTarget = (e: QuestionEntry): ReportTarget => ({
    kind: 'quiz_question',
    id: `${quiz.id}/${e.question.id}`,
    code: null,
    version: null,
    location: {
      path: paths.quiz(course, quiz, quiz.sections.length > 1 ? section.id : null),
      title: `${quiz.title} · ${plainText(e.group.name)} · Pregunta ${e.number}`.slice(0, 200),
      quizId: quiz.id,
      sectionId: section.id,
      number: e.number,
    },
  });
  // A short question with its answer shown (before saying whether the user knew it).
  const [revealedAt, setRevealedAt] = useState<string | null>(null);
  const sectionIndex = quiz.sections.findIndex((s) => s.id === section.id);
  const restartRef = useRef<HTMLButtonElement>(null);

  // A new question on screen: from the top, the answer of a short one hidden again.
  const position = round && screen === 'question' ? `${round.id}/${round.index}` : screen;
  const revealed = revealedAt === position;
  const reveal = useCallback(() => setRevealedAt(position), [position]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [position]);

  // The keys of the skill's page: 1–6 answer, Enter goes on, ← goes back; Space and 1/2 on short ones.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoom || confirming || reporting || screen !== 'question' || !round || !current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
      const done = isAnswered(round);
      const q = current.question;
      if (e.key === 'ArrowLeft') {
        if (round.index > 0) {
          actions.back();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Enter') {
        // On a focused button, Enter is that button's.
        if (e.target instanceof HTMLButtonElement && !done) return;
        if (done) actions.next();
        else if (q.kind === 'short' && !revealed) reveal();
        e.preventDefault();
        return;
      }
      if (e.key === ' ' && q.kind === 'short' && !done && !revealed) {
        reveal();
        e.preventDefault();
        return;
      }
      const n = Number(e.key);
      if (done || !(n >= 1 && n <= 6)) return;
      if (q.kind === 'choice') {
        const order = round.orders[round.index] ?? q.options.map((_, i) => i);
        const original = order[n - 1];
        if (original !== undefined) {
          actions.answer(original);
          e.preventDefault();
        }
      } else if (revealed && n <= 2) {
        actions.selfAssess(n === 1);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, confirming, current, reporting, reveal, revealed, round, screen, zoom]);

  const s = round ? score(round) : null;
  const tab = (id: string) => {
    rememberTab(quiz.id, id);
    navigate(paths.quiz(course, quiz, id), { state: { fromTab: true } });
  };

  return (
    <>
      {/* The test's bar: only while answering. On the cover and the results the menu and the breadcrumbs
          already say where the test is. */}
      {screen === 'question' ? (
        <div className="qz-bar">
          <div className="wrap hrow">
            {/* Which course and assessment the test is from: the breadcrumbs are not on this screen. */}
            <span className="hname">
              <span className="hwhere">
                <Link to={paths.course(course)}>
                  {course.emoji} {course.name}
                </Link>
                {assessment ? (
                  <>
                    {' · '}
                    <Link to={paths.assessment(course, assessment.id)}>{assessment.name}</Link>
                  </>
                ) : null}
              </span>
              <span className="htitle">{quiz.title}</span>
            </span>
            <span className="hgrow" />
            {round && s ? (
              <>
                <span className="cont" aria-label="Pregunta actual">
                  {round.index + 1} / {round.queue.length}
                </span>
                <span className="marca" aria-label={`${s.correct} buenas y ${s.wrong} malas`}>
                  <span className="vb">
                    ✓&nbsp;<b>{s.correct}</b>
                  </span>
                  <span className="vm">
                    ✗&nbsp;<b>{s.wrong}</b>
                  </span>
                </span>
                <span className="hacc">
                  <button
                    ref={restartRef}
                    type="button"
                    className="hbtn"
                    title="Reiniciar la ronda"
                    aria-label="Reiniciar la ronda"
                    onClick={() => setConfirming(true)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3" />
                      <path d="M3 3v5.3h5.3" />
                    </svg>
                    <span>Reiniciar</span>
                  </button>
                  <button
                    type="button"
                    className="hbtn"
                    title="Terminar ahora y ver el resultado de las respondidas"
                    aria-label="Terminar ahora"
                    onClick={actions.finishNow}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {/* A finish flag. */}
                      <path d="M5 21V4" />
                      <path d="M5 4h11l-2 4 2 4H5" />
                    </svg>
                    <span>Terminar</span>
                  </button>
                  <button
                    type="button"
                    className="hbtn"
                    title="Volver a elegir los temas (la ronda queda guardada)"
                    aria-label="Volver a elegir los temas"
                    onClick={actions.home}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {/* A list with checks: the test's topics to choose from. */}
                      <path d="m3 6 1.5 1.5L7 5" />
                      <path d="m3 12 1.5 1.5L7 11" />
                      <path d="m3 18 1.5 1.5L7 17" />
                      <path d="M11 6h10M11 12h10M11 18h10" />
                    </svg>
                    <span>Temas</span>
                  </button>
                </span>
              </>
            ) : null}
          </div>
          <div className="pb">
            <i style={{ width: `${round ? progress(round) * 100 : 0}%` }} />
          </div>
        </div>
      ) : null}

      {session.saving === 'failed' ? (
        <div className={screen === 'question' ? 'wrap' : 'wrap wide'}>
          <div className="qz-warn" role="alert">
            <span>No se pudo guardar tu avance. Revisa tu conexión.</span>
            <button type="button" className="btn2" onClick={actions.retrySaving}>
              Reintentar
            </button>
          </div>
        </div>
      ) : null}

      {screen === 'cover' ? (
        <>
          {crumbs}
          <Cover
            quiz={quiz}
            section={section}
            round={round}
            preferences={preferences}
            onChoose={actions.choose}
            onStart={actions.start}
            onResume={actions.resume}
            onDiscard={actions.discard}
            onTab={tab}
            focusTab={fromTab}
          />
          {quiz.footer ? <Html as="p" className="wrap wide qz-foot" html={quiz.footer} /> : null}
        </>
      ) : null}

      {screen === 'question' && round && current ? (
        <>
          <QuestionCard
            round={round}
            entry={current}
            sectionLabel={section.label}
            sectionIndex={sectionIndex}
            revealed={revealed}
            onReveal={reveal}
            onAnswer={actions.answer}
            onSelfAssess={actions.selfAssess}
            onNext={actions.next}
            onBack={actions.back}
            onZoom={setZoom}
            onReport={() => setReporting(current)}
          />
        </>
      ) : null}

      {screen === 'results' && round ? (
        <>
          {crumbs}
          <Results
            round={round}
            entries={entries}
            sectionName={quiz.sections.length > 1 ? section.name : null}
            onRepeatAll={actions.repeatAll}
            onRepeatWrong={actions.repeatWrong}
            onHome={actions.home}
            onReport={setReporting}
          />
          <p className="wrap wide qz-foot">
            <Link to={paths.course(course)} className="underline">
              Volver al ramo
            </Link>
          </p>
        </>
      ) : null}

      {confirming ? (
        <RestartDialog
          onConfirm={() => {
            setConfirming(false);
            actions.restart();
          }}
          onCancel={() => {
            setConfirming(false);
            restartRef.current?.focus();
          }}
        />
      ) : null}
      <ImageViewer image={zoom} onClose={() => setZoom(null)} />
      <ReportDialog
        target={reporting ? reportTarget(reporting) : null}
        onClose={() => setReporting(null)}
        onSent={() => {
          setReporting(null);
          setThanks(true);
        }}
      />
      {thanks ? (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <p className="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">
            Gracias: tu reporte le llegó al autor.
          </p>
        </div>
      ) : null}
    </>
  );
}

/** «¿Reiniciar la ronda?», inside the page. */
function RestartDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yes.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="quiz-dlg-velo" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="dlg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quiz-restart-title"
        aria-describedby="quiz-restart-text"
      >
        <h2 id="quiz-restart-title">¿Reiniciar la ronda?</h2>
        <p id="quiz-restart-text">
          Vuelves a la primera pregunta de esta ronda y se borran sus respuestas.
        </p>
        <div className="acciones">
          <button ref={yes} type="button" className="btn" onClick={onConfirm}>
            Reiniciar
          </button>
          <button type="button" className="btn2" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
