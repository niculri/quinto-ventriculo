import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  House,
  Layers,
  ListChecks,
  Settings,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import type { Catalog, CourseWithAssessments, NoteSummary, SemesterWithCourses } from '@qv/schema';
import { paths } from '../app/paths';
import {
  MORE_SEMESTERS_SOON,
  locateNote,
  noteBlocks,
  useCatalog,
} from '../features/catalog/queries';
import { buildAnkiTree, courseDeck, hasPage } from '../features/anki/tree';
import type { AnkiTree, CourseDeckNode } from '../features/anki/tree';
import { useSettingsGroups } from '../features/settings/useSettingsGroups';

/** What the URL is showing, as far as the menu cares. */
export interface Where {
  semester: number | null;
  courseId: string | null;
  assessmentId: string | null;
  /** The assessment's part being read. */
  tab: 'notes' | 'tests' | 'anki' | null;
  noteSlug: string | null;
  quizSlug: string | null;
  /** The deck open (or being studied), by id. */
  deckId: string | null;
  settings: boolean;
}

const NOWHERE: Where = {
  semester: null,
  courseId: null,
  assessmentId: null,
  tab: null,
  noteSlug: null,
  quizSlug: null,
  deckId: null,
  settings: false,
};

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Where a path is in the material (app/paths.ts builds them). */
export function locate(pathname: string, catalog: Catalog | null, tree: AnkiTree | null): Where {
  if (pathname.startsWith('/settings')) return { ...NOWHERE, settings: true };
  const m =
    /^\/semesters\/(\d+)(?:\/courses\/([^/]+)(?:\/(notes|tests|anki|assessments)(?:\/(.*))?)?)?\/?$/.exec(
      pathname,
    );
  if (!m) return NOWHERE;
  const where: Where = { ...NOWHERE, semester: Number(m[1]) };
  if (!m[2]) return where;
  const courseId = decode(m[2]);
  where.courseId = courseId;
  const kind = m[3];
  const rest = (m[4] ?? '').split('/').filter(Boolean).map(decode);
  if (kind === 'notes' && rest[0]) {
    where.tab = 'notes';
    where.noteSlug = rest[0];
    where.assessmentId = catalog
      ? (locateNote(catalog, 'slug', rest[0])?.assessment.id ?? null)
      : null;
  } else if (kind === 'tests' && rest[0]) {
    where.tab = 'tests';
    where.assessmentId = `${courseId}/${rest[0]}`;
    where.quizSlug = rest[1] ?? null;
  } else if (kind === 'assessments' && rest[0]) {
    where.assessmentId = `${courseId}/${rest[0]}`;
    where.tab = rest[1] === 'tests' ? 'tests' : 'notes';
  } else if (kind === 'anki') {
    where.tab = 'anki';
    // The deck whose page is the longest start of the path (…/study studies that deck).
    const path = pathname.replace(/\/study\/?$/, '');
    let best: CourseDeckNode | null = null;
    for (const n of tree?.nodes ?? []) {
      if (!hasPage(n) || n.courseId !== courseId) continue;
      const p = paths.deck(n.ref);
      if (
        (path === p || path.startsWith(`${p}/`)) &&
        (!best || p.length > paths.deck(best.ref).length)
      ) {
        best = n;
      }
    }
    where.deckId = best?.id ?? null;
    where.assessmentId = best?.assessmentId ?? null;
  }
  return where;
}

/** A course has something to show: notes, tests or decks. */
function hasMaterial(course: CourseWithAssessments, tree: AnkiTree | null): boolean {
  return (
    course.assessments.some((a) => a.notes.length || a.quizzes.length) ||
    (tree !== null && courseDeck(tree, course.id) !== null)
  );
}

const row = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors';
const idle = 'text-muted hover:bg-surface-2 hover:text-ink';
const current = 'bg-brand-soft font-medium text-ink';
/** On the path to the page open, but not it. */
const onPath = 'font-medium text-ink hover:bg-surface-2';

function NavLink({
  to,
  active,
  inPath = false,
  icon,
  children,
  onNavigate,
}: {
  to: string;
  active: boolean;
  inPath?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`${row} ${active ? current : inPath ? onPath : idle}`}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}

/** A part that opens and closes (an assessment, «Apuntes», «Tests»…), with what is in it below. */
function Branch({
  label,
  icon,
  open,
  onToggle,
  inPath,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  inPath: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${row} ${inPath ? onPath : idle}`}
      >
        {icon}
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronRight
          className={`size-3.5 flex-none text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? <Nested>{children}</Nested> : null}
    </li>
  );
}

/** One level down (the lists of a part): the tree's line under the icons, and little room taken. */
function Nested({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-0.5 mb-1 ml-[1.1rem] space-y-0.5 border-l border-border pl-1.5">
      {children}
    </ul>
  );
}

const icon = 'size-4 flex-none';

/**
 * The menu of the whole app, on the left: Inicio, the semester, the course, its assessments and, in each, its
 * notes, tests and decks. Only the path to the page open is unfolded (the levels above show just the way
 * there); in an assessment, its other parts («Tests» when reading a note, «Anki»…) are always there.
 */
export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const catalog = useCatalog();
  const data = catalog.data ?? null;
  const tree = useMemo(() => (data ? buildAnkiTree(data) : null), [data]);
  const where = useMemo(() => locate(pathname, data, tree), [pathname, data, tree]);
  return (
    <nav aria-label="Menú del sitio" className="text-[0.86rem] leading-snug">
      {/* What was opened or closed by hand is forgotten on going to another page. */}
      <NavTree
        key={pathname}
        where={where}
        catalog={data}
        tree={tree}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function NavTree({
  where,
  catalog,
  tree,
  pathname,
  onNavigate,
}: {
  where: Where;
  catalog: Catalog | null;
  tree: AnkiTree | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  const semesters = (catalog?.semesters ?? []).filter((s) =>
    s.courses.some((c) => hasMaterial(c, tree)),
  );
  const semester = semesters.find((s) => s.number === where.semester) ?? null;
  const link = { onNavigate };
  return (
    <ul className="space-y-0.5">
      <li>
        <NavLink
          to={paths.home}
          active={pathname === paths.home}
          icon={<House className={icon} aria-hidden="true" />}
          {...link}
        >
          Inicio
        </NavLink>
      </li>
      {where.settings ? (
        <SettingsBranch pathname={pathname} onNavigate={onNavigate} />
      ) : semester ? (
        // Inside a semester: only it (the others are a step back, in «Inicio»).
        <SemesterBranch
          semester={semester}
          where={where}
          tree={tree}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ) : (
        <>
          {semesters.map((s) => (
            <li key={s.number}>
              <NavLink
                to={paths.semester(s.number)}
                active={false}
                icon={<CalendarDays className={icon} aria-hidden="true" />}
                {...link}
              >
                {s.name}
              </NavLink>
            </li>
          ))}
          {/* The semesters the site hides (no material yet): one line where they would be. */}
          {catalog?.hiddenSemesters ? (
            <li className="px-2.5 py-1.5 text-xs text-muted">{MORE_SEMESTERS_SOON}</li>
          ) : null}
        </>
      )}
    </ul>
  );
}

/**
 * The semester and, inside a course, the course and its assessments: one under the other, without indenting
 * (they are the way there, as breadcrumbs); only the lists inside them go one step in.
 */
function SemesterBranch({
  semester,
  where,
  tree,
  pathname,
  onNavigate,
}: {
  semester: SemesterWithCourses;
  where: Where;
  tree: AnkiTree | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  const course = semester.courses.find((c) => c.id === where.courseId) ?? null;
  const emoji = (c: CourseWithAssessments) => (
    <span className="w-4 flex-none text-center" aria-hidden="true">
      {c.emoji}
    </span>
  );
  return (
    <>
      <li>
        <NavLink
          to={paths.semester(semester.number)}
          active={pathname === paths.semester(semester.number)}
          inPath={course !== null}
          icon={<CalendarDays className={icon} aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          {semester.name}
        </NavLink>
        {/* On the semester's page, its courses. */}
        {course ? null : (
          <Nested>
            {semester.courses
              .filter((c) => hasMaterial(c, tree))
              .map((c) => (
                <li key={c.id}>
                  <NavLink
                    to={paths.course(c)}
                    active={false}
                    icon={emoji(c)}
                    onNavigate={onNavigate}
                  >
                    {c.name}
                  </NavLink>
                </li>
              ))}
          </Nested>
        )}
      </li>
      {course ? (
        <>
          <li>
            <NavLink
              to={paths.course(course)}
              active={pathname === paths.course(course)}
              inPath
              icon={emoji(course)}
              onNavigate={onNavigate}
            >
              {course.name}
            </NavLink>
          </li>
          <CourseAssessments course={course} where={where} tree={tree} onNavigate={onNavigate} />
        </>
      ) : null}
    </>
  );
}

function CourseAssessments({
  course,
  where,
  tree,
  onNavigate,
}: {
  course: CourseWithAssessments;
  where: Where;
  tree: AnkiTree | null;
  onNavigate?: () => void;
}) {
  const decks = (tree?.nodes ?? []).filter(
    (n): n is CourseDeckNode => n.depth === 3 && hasPage(n) && n.courseId === course.id,
  );
  const assessments = course.assessments.filter(
    (a) => a.notes.length || a.quizzes.length || decks.some((d) => d.assessmentId === a.id),
  );
  // On the course's page every assessment is open; deeper, the one being read.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  if (!assessments.length) return null;
  return (
    <>
      {assessments.map((a) => {
        const inPath = a.id === where.assessmentId;
        const open = toggled[a.id] ?? (inPath || where.assessmentId === null);
        const deck = decks.find((d) => d.assessmentId === a.id) ?? null;
        return (
          <li key={a.id}>
            {/* The assessment: a small heading that opens and closes its parts. */}
            <button
              type="button"
              onClick={() => setToggled((t) => ({ ...t, [a.id]: !open }))}
              aria-expanded={open}
              className="mt-3 flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-xs font-semibold tracking-wide text-muted uppercase transition-colors hover:text-ink"
            >
              <span className="min-w-0 flex-1">{a.name}</span>
              <ChevronRight
                className={`size-3.5 flex-none transition-transform ${open ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <ul className="mt-0.5 space-y-0.5">
                <AssessmentParts
                  course={course}
                  assessment={a}
                  deck={deck}
                  where={
                    inPath
                      ? where
                      : { ...where, tab: null, noteSlug: null, quizSlug: null, deckId: null }
                  }
                  onNavigate={onNavigate}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

/** The notes of an assessment in the menu: by blocks with a title if some note has a week, else one block in order. */
function menuNoteBlocks(
  notes: readonly NoteSummary[],
): { key: string; title: string | null; notes: readonly NoteSummary[] }[] {
  return notes.some((n) => n.group) ? noteBlocks(notes) : [{ key: 'all', title: null, notes }];
}

/** «Apuntes», «Tests» and «Anki» of an assessment: the one being read unfolded, the others one line each. */
function AssessmentParts({
  course,
  assessment,
  deck,
  where,
  onNavigate,
}: {
  course: CourseWithAssessments;
  assessment: CourseWithAssessments['assessments'][number];
  deck: CourseDeckNode | null;
  where: Where;
  onNavigate?: () => void;
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (tab: 'notes' | 'tests' | 'anki') => toggled[tab] ?? where.tab === tab;
  const toggle = (tab: 'notes' | 'tests' | 'anki') =>
    setToggled((t) => ({ ...t, [tab]: !isOpen(tab) }));
  return (
    <>
      {assessment.notes.length ? (
        <Branch
          label="Apuntes"
          icon={<BookOpen className={icon} aria-hidden="true" />}
          open={isOpen('notes')}
          inPath={where.tab === 'notes'}
          onToggle={() => toggle('notes')}
        >
          {/* Revisión de cero (1.8): with weeks (the notes' groups), the same blocks as the assessment's list, each
              name above its notes (not a link); a note without a week then goes under its kind («Seminarios»), not
              under the last week. Without weeks, in order, as before. */}
          {menuNoteBlocks(assessment.notes).flatMap((block, b) =>
            block.notes.map((n, i) => (
              <li key={n.id}>
                {block.title !== null && i === 0 ? (
                  <p
                    className={`${b > 0 ? 'mt-2' : ''} px-2.5 pt-0.5 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted uppercase`}
                  >
                    {block.title}
                  </p>
                ) : null}
                <NavLink
                  to={paths.note(course, n.slug)}
                  active={n.slug === where.noteSlug}
                  onNavigate={onNavigate}
                >
                  {n.title}
                </NavLink>
              </li>
            )),
          )}
        </Branch>
      ) : null}
      {assessment.quizzes.length === 1 ? (
        // One test: «Tests» goes straight to it (no list of one under it).
        <li>
          <NavLink
            to={paths.quiz(course, assessment.quizzes[0]!)}
            active={where.tab === 'tests'}
            icon={<ListChecks className={icon} aria-hidden="true" />}
            onNavigate={onNavigate}
          >
            Tests
          </NavLink>
        </li>
      ) : assessment.quizzes.length ? (
        <Branch
          label="Tests"
          icon={<ListChecks className={icon} aria-hidden="true" />}
          open={isOpen('tests')}
          inPath={where.tab === 'tests'}
          onToggle={() => toggle('tests')}
        >
          {assessment.quizzes.map((q) => (
            <li key={q.id}>
              <NavLink
                to={paths.quiz(course, q)}
                active={q.slug === where.quizSlug}
                onNavigate={onNavigate}
              >
                {q.title}
              </NavLink>
            </li>
          ))}
        </Branch>
      ) : null}
      {deck ? (
        // An assessment's weeks or lectures are chosen on its page: there is nothing to go to inside them.
        <li>
          <NavLink
            to={paths.deck(deck.ref)}
            active={where.tab === 'anki'}
            icon={<Layers className={icon} aria-hidden="true" />}
            onNavigate={onNavigate}
          >
            Anki
          </NavLink>
        </li>
      ) : null}
    </>
  );
}

function SettingsBranch({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const groups = useSettingsGroups();
  return (
    <li>
      <p className={`${row} font-medium text-ink`}>
        <Settings className={icon} aria-hidden="true" /> Opciones
      </p>
      {/* Its groups' titles («Cuenta», «Anki») are headings, not links, as on the page. */}
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mt-3 px-2.5 py-1 text-xs font-semibold tracking-wide text-muted uppercase">
            {g.title}
          </p>
          <ul className="space-y-0.5">
            {g.sections.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  active={pathname === to}
                  icon={<Icon className={icon} aria-hidden="true" />}
                  onNavigate={onNavigate}
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </li>
  );
}
