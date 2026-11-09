import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ListTree, MessageSquareWarning } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { paths } from '../../app/paths';
import { Canonical } from '../catalog/Redirects';
import type { Note } from '@qv/schema';
import { ApiRequestError } from '../../lib/api';
import { ErrorWithRetry } from '../../ui/Notice';
import { Skeleton } from '../../ui/Loading';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { button, page } from '../../ui/styles';
import { Rail } from '../../ui/rail';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { locateNote, useNote, useCatalog } from '../catalog/queries';
import type { NoteLocation } from '../catalog/queries';
import { NoteContent } from './NoteContent';
import { Toc, activeTitle } from './Toc';
import { KIND_NAMES, headerParts, noteDates, versionedCode } from './header';
import { PRACTICE_ANCHOR, Practice, usePractice } from './Practice';
import { useActiveSection } from './useActiveSection';
import { ImageViewer } from './ImageViewer';
import { flashHeading } from './flash';
import type { OpenImage } from './ImageViewer';
import { SelectionReportBar, useArticleSelection } from './reporting';
import { ReportDialog } from '../reports/ReportDialog';
import type { ReportLocation, ReportTarget } from '../reports/repository';
import type { ReportCategory } from '@qv/schema';
import { useCountOpen } from '../usage/count';

export function NotePage() {
  const { noteSlug: slug = '', number = '', courseId = '' } = useParams();
  const note = useNote(slug);
  // «Uso» (step 2.9): this page is what opens a note.
  useCountOpen('note', note.data ? slug : null);
  const catalog = useCatalog();

  if (note.isError) {
    if (note.error instanceof ApiRequestError && note.error.status === 404) return <NotFoundPage />;
    return <ErrorWithRetry error={note.error} onRetry={() => void note.refetch()} />;
  }
  if (!note.data) return <NoteSkeleton />;
  const location = catalog.data ? locateNote(catalog.data, 'slug', slug) : null;
  // The semester or the course of the URL are not the note's: to its canonical URL (#anchor kept).
  if (
    location &&
    (String(location.semester.number) !== number || location.course.id !== courseId)
  ) {
    return <Canonical path={paths.note(location.course, location.note.slug)} />;
  }
  return <NoteView key={note.data.id} note={note.data} location={location} />;
}

function NoteView({ note, location }: { note: Note; location: NoteLocation | null }) {
  const content = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<OpenImage | null>(null);
  // Step 2.6: «Reportar error» from the end, from a selection (the bar at the bottom) or from an image.
  const [reporting, setReporting] = useState<{
    target: ReportTarget;
    category?: ReportCategory;
  } | null>(null);
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    if (!thanks) return;
    const id = setTimeout(() => setThanks(false), 3000);
    return () => clearTimeout(id);
  }, [thanks]);
  const selected = useArticleSelection(body, !reporting && !image);
  const [tocOpen, setTocOpen] = useState(false);
  const { active, progress } = useActiveSection(content, true);
  const { hash, pathname } = useLocation();
  const targetOf = (place: ReportLocation): ReportTarget => ({
    kind: 'note',
    id: note.id,
    code: note.code ?? null,
    version: note.version ?? null,
    location: { path: pathname, title: note.title, ...place },
  });
  const located = location !== null;
  const practice = usePractice(note, location);
  const hasPractice = !!location && !!(practice.quiz || practice.deck);
  // «Ponte a prueba» is outside the article's HTML: it goes last in the TOC.
  const toc = useMemo(
    () =>
      hasPractice
        ? [...note.toc, { anchor: PRACTICE_ANCHOR, title: 'Ponte a prueba', level: 2 as const }]
        : note.toc,
    [note.toc, hasPractice],
  );

  useEffect(() => {
    document.title = `${note.title} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [note.title]);

  // Arriving at a section (from search or a link): go there and highlight it for a moment.
  useEffect(() => {
    if (!hash) return;
    let id = hash.slice(1);
    // A text fragment («#sección:~:text=…», the panel's link to a quote): the browsers that do not take it out of the
    // hash leave it here.
    const directive = id.indexOf(':~:');
    if (directive >= 0) id = id.slice(0, directive);
    if (!id) return;
    try {
      id = decodeURIComponent(id);
    } catch {
      // a lone «%» in the link: it is looked up as is instead of breaking the page
    }
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    flashHeading(el);
    // Again when the catalog arrives: the breadcrumbs above push the text down.
  }, [hash, located]);

  const current = activeTitle(toc, active);

  // The phone's TOC closes with Escape or a touch outside it.
  const tocBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tocOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!tocBar.current?.contains(e.target as Node)) setTocOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTocOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tocOpen]);

  return (
    <div className={page}>
      {/* The breadcrumbs as on every page: from «Inicio», above the article and its TOC. */}
      <Breadcrumbs
        items={[
          { label: 'Inicio', to: paths.home },
          ...(location
            ? [
                { label: location.semester.name, to: paths.semester(location.semester.number) },
                { label: location.course.name, to: paths.course(location.course) },
                {
                  label: location.assessment.name,
                  to: paths.assessment(location.course, location.assessment.id),
                },
                {
                  label: 'Apuntes',
                  to: paths.assessmentNotes(location.course, location.assessment.id),
                },
              ]
            : []),
          { label: note.title },
        ]}
      />
      <article className="w-full min-w-0">
        <NoteHeader note={note} />

        {/* Up to the right column (xl): the TOC folds under the site's bar and says where you are. The strip
            above it covers the gap with the site's bar, so that the text does not show through it. */}
        {toc.length ? (
          <div
            ref={tocBar}
            className="sticky top-[4.5rem] z-30 mb-6 before:absolute before:inset-x-0 before:bottom-full before:h-2 before:bg-bg xl:hidden"
          >
            <button
              type="button"
              onClick={() => setTocOpen((o) => !o)}
              aria-expanded={tocOpen}
              aria-controls="toc-panel"
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface/95 px-3 py-2 text-left text-sm shadow-xs backdrop-blur"
            >
              <ListTree className="size-4 flex-none text-muted" aria-hidden="true" />
              <span className="flex-none font-medium text-ink">Índice</span>
              {current ? (
                <span className="min-w-0 truncate text-muted" aria-hidden="true">
                  · {current}
                </span>
              ) : null}
              <ChevronDown
                className={`ml-auto size-4 flex-none text-muted transition ${tocOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            <div
              className="absolute inset-x-0 h-0.5 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {tocOpen ? (
              <div
                id="toc-panel"
                data-toc-scroll
                className="absolute inset-x-0 mt-2 max-h-[65dvh] overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-soft"
              >
                <Toc toc={toc} active={active} expandAll onSelect={() => setTocOpen(false)} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div ref={content}>
          <NoteContent ref={body} html={note.html} onOpenImage={setImage} />
          {location && hasPractice ? <Practice note={note} location={location} /> : null}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setReporting({ target: targetOf({}) })}
            className={`${button.base} ${button.secondary}`}
          >
            <MessageSquareWarning className="size-4" aria-hidden="true" /> Reportar un error en este
            apunte
          </button>
          <p className="text-sm text-muted">O selecciona el texto que está mal.</p>
        </div>

        {location ? <Neighbors location={location} /> : null}
      </article>

      {/* On wide screens, in the site's right column. */}
      <Rail>
        <Toc toc={toc} active={active} progress={progress} />
      </Rail>
      <ImageViewer
        image={image}
        onClose={() => setImage(null)}
        onReport={(img) => {
          setImage(null);
          setReporting({
            target: targetOf({
              ...(img.section ? { section: img.section } : {}),
              ...(img.sectionTitle ? { sectionTitle: img.sectionTitle } : {}),
              figure: (img.caption || img.alt || 'Imagen sin leyenda').slice(0, 300),
            }),
            category: 'image',
          });
        }}
      />
      {selected && !reporting ? (
        <SelectionReportBar onReport={() => setReporting({ target: targetOf(selected) })} />
      ) : null}
      {thanks && !selected ? (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <p className="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">
            Gracias: tu reporte le llegó al autor.
          </p>
        </div>
      ) : null}
      <ReportDialog
        target={reporting?.target ?? null}
        {...(reporting?.category ? { category: reporting.category } : {})}
        onClose={() => setReporting(null)}
        onSent={() => {
          setReporting(null);
          document.getSelection()?.removeAllRanges();
          setThanks(true);
        }}
      />
    </div>
  );
}

function NoteHeader({ note }: { note: Note }) {
  const parts = note.header ? headerParts(note.kind, note.header) : [];
  return (
    <header className="mb-10 border-b border-border pb-8">
      {note.header ? null : (
        <p className="mb-2 text-xs font-semibold tracking-wide text-brand uppercase">
          {KIND_NAMES[note.kind]}
        </p>
      )}
      <h1 className="font-serif text-[2.1rem] leading-tight font-semibold tracking-tight sm:text-[2.6rem]">
        {note.title}
      </h1>
      {note.subtitle ? <p className="mt-3 text-lg text-muted">{note.subtitle}</p> : null}
      {parts.length ? (
        <p className="mt-4 text-[0.95rem] leading-relaxed text-ink">
          {parts.map((p, i) => (
            <span key={p}>
              {i ? <span className="px-1.5 text-muted">·</span> : null}
              <span className={i === 0 ? 'font-semibold' : ''}>{p}</span>
            </span>
          ))}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span
          className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink"
          title={note.code ? 'Código y versión de este artículo' : undefined}
        >
          {versionedCode(note)}
        </span>
        {noteDates(note).map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {note.sources.length ? (
        <details className="group mt-4 text-sm">
          <summary className="cursor-pointer text-muted select-none hover:text-ink">
            Fuentes del apunte
          </summary>
          <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-4 leading-relaxed text-muted">
            {note.sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </header>
  );
}

function Neighbors({ location }: { location: NoteLocation }) {
  const { previous, next } = location;
  if (!previous && !next) return null;
  const box =
    'flex-1 rounded-xl border border-border p-4 transition hover:border-border-strong hover:bg-surface';
  return (
    <nav
      aria-label="Otros apuntes"
      className="mt-16 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row"
    >
      {previous ? (
        <Link to={paths.note(location.course, previous.slug)} className={box}>
          <span className="flex items-center gap-1 text-xs text-muted">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Anterior
          </span>
          <span className="mt-1 block font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {next ? (
        <Link to={paths.note(location.course, next.slug)} className={`${box} text-right`}>
          <span className="flex items-center justify-end gap-1 text-xs text-muted">
            Siguiente <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
          <span className="mt-1 block font-medium">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

function NoteSkeleton() {
  return (
    <div className="mx-auto max-w-[46rem] px-4 py-10" role="status" aria-label="Cargando el apunte">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-6 h-12 w-3/4" />
      <Skeleton className="mt-4 h-5 w-1/2" />
      <div className="mt-12 space-y-3">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}
