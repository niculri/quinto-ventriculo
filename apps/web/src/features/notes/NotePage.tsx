// A note's page: the article with its header, table of contents, practice links, image viewer and error reports.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ListTree,
  MessageSquareWarning,
  Search,
  X,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { paths } from '../../shared/lib/paths';
import { Canonical } from '../../shared/ui/Canonical';
import type { Note } from '@qv/schema';
import { ApiRequestError } from '../../shared/lib/api';
import { ErrorWithRetry } from '../../shared/ui/Notice';
import { Skeleton } from '../../shared/ui/Loading';
import { Breadcrumbs } from '../../shared/ui/Breadcrumbs';
import { button, page, tapArea } from '../../shared/ui/styles';
import { Rail } from '../../shared/ui/rail';
import { NotFoundPage } from '../../shared/ui/NotFoundPage';
import { locateNote, useNote, useCatalog } from '../catalog/queries';
import type { NoteLocation } from '../catalog/queries';
import { NoteContent } from './NoteContent';
import { Toc, activeTitle } from './Toc';
import { KIND_NAMES, headerParts, noteDates, versionedCode } from './header';
import { PRACTICE_ANCHOR, Practice, usePractice } from './Practice';
import { useActiveSection } from './useActiveSection';
import { ImageViewer } from '../../shared/ui/ImageViewer';
import { flashHeading } from './flash';
import type { OpenImage } from '../../shared/ui/ImageViewer';
import { SelectionReportBar, useArticleSelection } from './reporting';
import { ReportDialog } from '../reports/ReportDialog';
import type { ReportLocation, ReportTarget } from '../reports/api/repository';
import type { ReportCategory } from '@qv/schema';
import { useCountOpen } from '../usage/count';
import { rememberNote } from './lastNote';
import { useTip } from '../tips/useTip';
import { useReadingFonts } from '../../shared/lib/readingFonts';
import { noteCrumbs } from './noteCrumbs';
import { StatusToast } from '../../shared/ui/Toast';

export function NotePage() {
  const { noteSlug: slug = '', number = '', courseId = '' } = useParams();
  const note = useNote(slug);
  // Only this page counts as opening a note.
  useCountOpen('note', note.data ? slug : null);
  const catalog = useCatalog();
  const fonts = useReadingFonts();
  const location = catalog.data ? locateNote(catalog.data, 'slug', slug) : null;

  if (note.isError) {
    if (note.error instanceof ApiRequestError && note.error.status === 404) return <NotFoundPage />;
    return <ErrorWithRetry error={note.error} onRetry={() => void note.refetch()} />;
  }
  if (!note.data || !fonts) return <NoteSkeleton location={location} />;
  if (
    location &&
    (String(location.semester.number) !== number || location.course.id !== courseId)
  ) {
    return <Canonical path={paths.note(location.course, location.note.slug)} />;
  }
  return <NoteView key={note.data.id} note={note.data} location={location} />;
}

export function NoteView({
  note,
  location,
  remember = true,
}: {
  note: Note;
  location: NoteLocation | null;
  remember?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<OpenImage | null>(null);
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
  const toc = useMemo(
    () =>
      hasPractice
        ? [...note.toc, { anchor: PRACTICE_ANCHOR, title: 'Ponte a prueba', level: 2 as const }]
        : note.toc,
    [note.toc, hasPractice],
  );

  useEffect(() => {
    if (remember) rememberNote(note.slug);
  }, [note.slug, remember]);
  const tip = useTip('tip-search', progress >= 0.95);

  useEffect(() => {
    document.title = `${note.title} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [note.title]);

  useEffect(() => {
    if (!hash) return;
    let id = hash.slice(1);
    // Browsers that do not take a text fragment («:~:text=…») out of the hash leave it here.
    const directive = id.indexOf(':~:');
    if (directive >= 0) id = id.slice(0, directive);
    if (!id) return;
    try {
      id = decodeURIComponent(id);
    } catch {
      // a lone «%»: looked up as is
    }
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    flashHeading(el);
    // `located`: again when the catalog arrives, since the breadcrumbs push the text down.
  }, [hash, located]);

  const current = activeTitle(toc, active);

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
      <Breadcrumbs items={noteCrumbs(location, note.title)} />
      <article className="w-full min-w-0">
        <NoteHeader note={note} />

        {/* The `before:` strip covers the gap with the site's bar, so the text does not show through. */}
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

        {tip.slot ? (
          <div className="mt-6 h-16" aria-live="polite">
            {tip.show ? (
              <p className="flex h-full items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 text-sm">
                <Search className="size-4 flex-none text-brand" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  ¿Buscas otro tema? El buscador de arriba encuentra cualquier apunte
                  <span className="pointer-coarse:hidden">, también con la tecla /</span>.
                </span>
                <button
                  type="button"
                  onClick={tip.close}
                  aria-label="Cerrar el consejo"
                  className="flex-none rounded p-1 text-muted hover:bg-surface hover:text-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </p>
            ) : null}
          </div>
        ) : null}

        {location ? <Neighbors location={location} /> : null}
      </article>

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
        <StatusToast>Gracias: tu reporte le llegó al autor.</StatusToast>
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
          <summary className={`cursor-pointer text-muted select-none hover:text-ink ${tapArea}`}>
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

/** Real breadcrumbs once the catalog is in: on a phone they wrap, and a one-line stand-in would move the title. */
function NoteSkeleton({ location }: { location: NoteLocation | null }) {
  return (
    <div className={page}>
      {location ? (
        <Breadcrumbs items={noteCrumbs(location, location.note.title)} />
      ) : (
        <div className="mb-4 flex h-5 items-center">
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      )}
      <div role="status" aria-label="Cargando el apunte">
        <div className="mb-10 border-b border-border pb-8">
          <div className="flex h-[2.625rem] items-center sm:h-[3.25rem]">
            <Skeleton className="h-9 w-3/4 sm:h-11" />
          </div>
          <div className="mt-4 flex h-[1.5625rem] items-center">
            <Skeleton className="h-5 w-1/2" />
          </div>
          <Skeleton className="mt-4 h-5 w-64 max-w-full" />
          <Skeleton className="mt-4 h-5 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
