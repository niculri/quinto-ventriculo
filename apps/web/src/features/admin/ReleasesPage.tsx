import { useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CircleCheck, CircleX, LoaderCircle, TriangleAlert } from 'lucide-react';
import { lastName, onlyInCatalog, plainText, releaseTitle, wordDiff } from '@qv/schema';
import type {
  Check,
  ReleaseArticleItem,
  ReleaseAssessment,
  ReleaseCardItem,
  ReleaseClass,
  ReleaseOp,
  ReleaseOverview,
  ReleaseQuestionItem,
  ReleaseRecord,
  ReviewList,
} from '@qv/schema';
import { Skeleton } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { Reserved } from '../../ui/Reserved';
import { Switch } from '../../ui/Switch';
import { button, card } from '../../ui/styles';
import { usePreview } from '../preview/preview';
import { useCatalog } from '../catalog/queries';
import { useUser } from '../session/context';
import { AdminSectionTitle } from './AdminLayout';
import {
  usePublishRelease,
  useReleaseImpact,
  useReleaseItems,
  useReleaseLog,
  useReleaseOverview,
  useReleaseReview,
  useRevertRelease,
  useSetReleaseMark,
} from './releaseQueries';

/**
 * «Administración» → «Publicaciones» (step 1.7, part 2; its own page since step 2.10), only for administrators (the
 * layout checks it): the preview of the draft, what the draft
 * changes against what is published (by course and assessment, with the before and after of each card, article
 * section and question, how it is classified and whom it reaches) and the review list; and (part 3) «Publicar», with
 * its confirmation, the last publication with «Deshacer la última publicación», and the log. Nothing moves when it
 * loads nor when it publishes: the last publication's card and the bar of «Publicar» keep their height.
 */
export function ReleasesPage() {
  return (
    <>
      <AdminSectionTitle title="Publicaciones" />
      <PreviewCard />
      <LastRelease />
      <ReleaseBody />
      <ReleaseLogSection />
    </>
  );
}

function PreviewCard() {
  const preview = usePreview();
  return (
    <section aria-labelledby="preview" className={`${card} mt-6 flex items-start gap-4 p-4 sm:p-5`}>
      <div className="min-w-0 flex-1">
        <h3 id="preview" className="font-semibold">
          Vista previa del borrador
        </h3>
        <p className="mt-1 text-sm text-muted">
          Todo el sitio con el borrador, como lo verán los alumnos cuando se publique. Lo que
          estudies o respondas mientras tanto no se guarda.
        </p>
      </div>
      <Switch
        label="Ver el sitio con el borrador"
        checked={preview.active}
        disabled={!preview.available}
        onChange={(on) => (on ? preview.enter() : preview.exit())}
      />
    </section>
  );
}

function ReleaseBody() {
  const overview = useReleaseOverview(true);
  if (overview.isError) {
    return (
      <div className="mt-6">
        <ErrorWithRetry error={overview.error} onRetry={() => void overview.refetch()} />
      </div>
    );
  }
  if (!overview.data) {
    return (
      <div aria-busy="true" className="mt-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  return <Release overview={overview.data} />;
}

function Release({ overview }: { overview: ReleaseOverview }) {
  const { review, errors } = useReleaseReview(overview);
  const s = overview.summary;
  if (!review) return null;
  if (review.empty) {
    return (
      <p className={`${card} mt-8 p-5 text-muted`}>
        El borrador es igual a lo publicado: no hay nada que revisar.
      </p>
    );
  }
  return (
    <>
      <ReviewSection review={review} overview={overview} failed={errors.length > 0} />
      <section aria-labelledby="changes" className="mt-10">
        <h3 id="changes" className="text-lg font-semibold">
          Qué cambia
        </h3>
        <SiteChanges overview={overview} />
        <div className="mt-4 space-y-4">
          {/* Revisión de cero (1.8): an empty assessment that only comes into the catalog is one line above. */}
          {s.assessments
            .filter((a) => !onlyInCatalog(s, a))
            .map((a) => (
              <AssessmentChanges key={a.id} a={a} overview={overview} />
            ))}
        </div>
      </section>
    </>
  );
}

// ─────────────────────────────────────────────── the review list ───────────────────────────────────────────────

const status = (r: ReviewList) =>
  r.pending
    ? 'Revisando las imágenes y los textos…'
    : r.blocking
      ? r.blocking === 1
        ? 'Hay 1 regla que impide publicar.'
        : `Hay ${r.blocking} reglas que impiden publicar.`
      : r.manual.every((m) => m.checked)
        ? 'Nada impide publicar.'
        : 'Nada lo impide; faltan las marcas a mano.';

function ReviewSection({
  review,
  overview,
  failed,
}: {
  review: ReviewList;
  overview: ReleaseOverview;
  failed: boolean;
}) {
  const fingerprint = overview.summary.fingerprint;
  const blocks = review.checks.filter((c) => c.severity === 'block');
  const warns = review.checks.filter((c) => c.severity === 'warn');
  return (
    <section aria-labelledby="review" className="mt-8">
      <h3 id="review" className="text-lg font-semibold">
        Lista de revisión
      </h3>
      <Reserved longest="Nada lo impide; faltan las marcas a mano." className="mt-1 text-sm">
        <p role="status" className={review.blocking ? 'text-state-learn' : 'text-muted'}>
          {status(review)}
        </p>
      </Reserved>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          No se pudieron revisar las imágenes o los textos. Recarga la página para intentarlo de
          nuevo.
        </p>
      ) : null}
      <h4 className="mt-5 text-sm font-semibold text-muted">Impiden publicar</h4>
      <ul className={`${card} mt-2 divide-y divide-border`}>
        {blocks.map((c) => (
          <CheckRow key={c.rule} check={c} />
        ))}
      </ul>
      <h4 className="mt-5 text-sm font-semibold text-muted">Avisos</h4>
      <ul className={`${card} mt-2 divide-y divide-border`}>
        {warns.map((c) => (
          <CheckRow key={c.rule} check={c} />
        ))}
      </ul>
      <h4 className="mt-5 text-sm font-semibold text-muted">A mano, para este borrador</h4>
      <ManualMarks review={review} fingerprint={fingerprint} />
      <PublishBar review={review} overview={overview} />
    </section>
  );
}

const SHOWN = 8;

function CheckRow({ check: c }: { check: Check }) {
  const [all, setAll] = useState(false);
  const failing = c.items.length > 0;
  const Icon = c.pending
    ? LoaderCircle
    : !failing
      ? CircleCheck
      : c.severity === 'block'
        ? CircleX
        : TriangleAlert;
  const tone = c.pending
    ? 'text-muted animate-spin'
    : !failing
      ? 'text-state-review'
      : c.severity === 'block'
        ? 'text-state-learn'
        : 'text-accent';
  const shown = all ? c.items : c.items.slice(0, SHOWN);
  return (
    <li className="px-4 py-3 sm:px-5" data-rule={c.rule}>
      <div className="flex items-center gap-3">
        <Icon className={`size-4 flex-none ${tone}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{c.title}</span>
        <span className="flex-none text-xs text-muted">
          {c.pending ? 'Revisando…' : failing ? c.items.length : 'Bien'}
        </span>
      </div>
      {failing ? (
        <ul className="mt-2 space-y-1 pl-7 text-sm text-muted">
          {shown.map((i) => (
            <li key={i.key} className="break-words">
              {i.text}
            </li>
          ))}
          {c.items.length > SHOWN ? (
            <li>
              <button
                type="button"
                onClick={() => setAll((v) => !v)}
                className="text-sm font-medium text-brand hover:underline"
              >
                {all ? 'Ver menos' : `Ver los ${c.items.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function ManualMarks({ review, fingerprint }: { review: ReviewList; fingerprint: string }) {
  const user = useUser();
  const mark = useSetReleaseMark(fingerprint, user.email);
  // The switch moves at once (the mark is saved in the background; if that fails, it goes back).
  const [shown, setShown] = useState<Partial<Record<string, boolean>>>({});
  return (
    <>
      <ul className={`${card} mt-2 divide-y divide-border`}>
        {review.manual.map((m) => (
          <li key={m.mark} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{m.label}</span>
              <Reserved longest="Marcada por alguien@ug.uchile.cl" className="text-xs text-muted">
                {m.checkedBy ? `Marcada por ${m.checkedBy}` : 'Sin marcar'}
              </Reserved>
            </span>
            <Switch
              label={m.label}
              checked={shown[m.mark] ?? m.checked}
              onChange={(checked) => {
                setShown((v) => ({ ...v, [m.mark]: checked }));
                mark.mutate(
                  { mark: m.mark, checked },
                  { onSettled: () => setShown(({ [m.mark]: _, ...rest }) => rest) },
                );
              }}
            />
          </li>
        ))}
      </ul>
      {mark.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {mark.error instanceof Error && 'status' in mark.error && mark.error.status === 409
            ? 'El borrador cambió desde que lo abriste: revisa de nuevo lo que trae.'
            : 'No se pudo guardar la marca. Inténtalo de nuevo.'}
        </p>
      ) : null}
    </>
  );
}

// ───────────────────────────────────────────────── what changes ────────────────────────────────────────────────

const CLASS: Record<ReleaseClass, string> = {
  answer: 'Puede cambiar la respuesta',
  no_answer: 'No cambia la respuesta',
  format: 'Solo formato',
  content: 'Cambia el texto',
};
const OP: Record<ReleaseOp, string> = {
  added: 'Nueva',
  removed: 'Sale',
  changed: 'Cambia',
  moved: 'Cambia de lugar',
};

function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'warn' | 'new';
}) {
  const color =
    tone === 'warn'
      ? 'border-accent/40 text-accent'
      : tone === 'new'
        ? 'border-state-review/40 text-state-review'
        : 'border-border text-muted';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {children}
    </span>
  );
}

const classTone = (c: ReleaseClass | null) =>
  c === 'answer' || c === 'content' ? 'warn' : 'muted';

function SiteChanges({ overview }: { overview: ReleaseOverview }) {
  const s = overview.summary;
  const indexLines = useIndexLines(overview);
  // Revisión de cero (1.8): an assessment goes with its course («Química general y orgánica · Certamen 1»): with the
  // full catalog, seven «Certamen 1» came in at once, all alike (and with the same key).
  const courseOf = new Map(s.assessments.map((a) => [a.id, a.courseName ?? a.courseId]));
  const lines = [
    ...s.catalog.map((c) => {
      const own = String((c.after ?? c.before)?.name ?? c.id);
      const course = c.kind === 'assessment' ? courseOf.get(c.id) : null;
      const name = course ? `${course} · ${own}` : own;
      const kind = { semester: 'El semestre', course: 'El ramo', assessment: 'La evaluación' }[
        c.kind
      ];
      // Revisión de cero (1.8): «La evaluación … es nueva» (it said «es nuevo»).
      const isNew = c.kind === 'assessment' ? 'es nueva' : 'es nuevo';
      return `${kind} «${name}» ${c.op === 'added' ? isNew : c.op === 'removed' ? 'sale' : 'cambia'}.`;
    }),
    ...s.noteTypes.map(
      (t) =>
        `El tipo de nota «${t.name}» ${t.op === 'added' ? 'es nuevo' : t.op === 'removed' ? 'sale' : 'cambia'}.`,
    ),
    ...s.presets.map(
      (p) =>
        `La configuración «${p.name}» ${p.op === 'added' ? 'es nueva' : p.op === 'removed' ? 'sale' : 'cambia'}.`,
    ),
    // The decks above the assessments (the root, a semester's, a course's).
    ...s.decks.map((d) =>
      d.op === 'added'
        ? `El mazo «${lastName(d.name)}» es nuevo.`
        : d.op === 'removed'
          ? `El mazo «${lastName(d.name)}» sale.`
          : d.nameBefore && d.nameBefore !== d.name
            ? `El mazo «${lastName(d.nameBefore)}» pasa a llamarse «${lastName(d.name)}».`
            : d.presetBefore !== d.presetAfter
              ? `El mazo «${lastName(d.name)}» pasa de la configuración «${d.presetBefore ?? 'ninguna'}» a «${d.presetAfter ?? 'ninguna'}».`
              : `El mazo «${lastName(d.name)}» cambia de lugar.`,
    ),
    ...indexLines,
  ];
  if (!lines.length) return null;
  return (
    <ul className={`${card} mt-3 space-y-1 p-4 text-sm text-muted sm:p-5`}>
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The card browser's indexes the draft changes (step 3.3), a line each, with the course and assessment names of the
 * catalog (the id while it loads or if the assessment is not in it).
 */
function useIndexLines(overview: ReleaseOverview): string[] {
  const catalog = useCatalog();
  const names = new Map<string, string>();
  for (const sem of catalog.data?.semesters ?? []) {
    for (const course of sem.courses) {
      for (const a of course.assessments) names.set(a.id, `${course.name} · ${a.name}`);
    }
  }
  return overview.browseIndexes.map((x) => {
    const name = names.get(x.assessmentId) ?? x.assessmentId;
    return x.op === 'added'
      ? `Las tarjetas de «${name}» se pueden explorar.`
      : x.op === 'removed'
        ? `Las tarjetas de «${name}» dejan de poder explorarse.`
        : `El explorador de tarjetas de «${name}» se actualiza.`;
  });
}

function Counts({ title, lines }: { title: string; lines: [number, string, string][] }) {
  const shown = lines.filter(([n]) => n > 0);
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {shown.length ? (
          shown.map(([n, one, many]) => <li key={one}>{plural(n, one, many)}</li>)
        ) : (
          <li>Sin cambios</li>
        )}
      </ul>
    </div>
  );
}

type Kind = 'article' | 'question' | 'card';

function AssessmentChanges({ a, overview }: { a: ReleaseAssessment; overview: ReleaseOverview }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const impact = useReleaseImpact(overview);
  const n = {
    article: a.articles.added + a.articles.removed + a.articles.content + a.articles.format,
    question: a.questions.total,
    card: a.cards.notes,
  };
  const reached = a.impactDecks.map((d) => ({ ...d, impact: impact.data?.get(d.id) }));
  const tab = (kind: Kind, label: string) =>
    n[kind] ? (
      <button
        type="button"
        aria-pressed={open === kind}
        onClick={() => setOpen((o) => (o === kind ? null : kind))}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          open === kind ? 'bg-brand-soft text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        {label} ({n[kind]})
      </button>
    ) : null;
  return (
    <article aria-labelledby={`a-${a.id}`} className={`${card} p-4 sm:p-5`}>
      <h4 id={`a-${a.id}`} className="font-semibold">
        {a.courseName ?? a.courseId} · {a.name ?? a.id}
      </h4>
      {a.suggestedDate ? (
        <p className="mt-0.5 text-xs text-muted">Prueba sugerida: {a.suggestedDate}</p>
      ) : null}
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Counts
          title="Artículos"
          lines={[
            [a.articles.added, 'nuevo', 'nuevos'],
            [a.articles.content, 'cambia el texto', 'cambian el texto'],
            [a.articles.format, 'solo de formato', 'solo de formato'],
            [a.articles.removed, 'sale', 'salen'],
          ]}
        />
        <Counts
          title="Preguntas"
          lines={[
            [a.questions.added, 'nueva', 'nuevas'],
            [a.questions.keyChanged, 'cambia la clave', 'cambian la clave'],
            [a.questions.answer, 'puede cambiar la respuesta', 'pueden cambiar la respuesta'],
            [a.questions.noAnswer, 'no cambia la respuesta', 'no cambian la respuesta'],
            [a.questions.format, 'solo de formato', 'solo de formato'],
            [a.questions.moved, 'cambia de tema', 'cambian de tema'],
            [a.questions.removed, 'sale', 'salen'],
          ]}
        />
        <Counts
          title="Tarjetas"
          lines={[
            [a.cards.added, 'nueva', 'nuevas'],
            [a.cards.answer, 'puede cambiar la respuesta', 'pueden cambiar la respuesta'],
            [a.cards.noAnswer, 'no cambia la respuesta', 'no cambian la respuesta'],
            [a.cards.format, 'solo de formato', 'solo de formato'],
            [a.cards.moved, 'cambia de mazo', 'cambian de mazo'],
            [a.cards.removed, 'sale', 'salen'],
          ]}
        />
      </div>
      {reached.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">A quién llega</p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {reached.map((d) => (
              <li key={d.id}>
                <Reserved
                  longest={`${lastName(d.name ?? d.id)}: 99999 alumnos vieron sus tarjetas (99999 tarjetas que salen o cambian)`}
                >
                  {lastName(d.name ?? d.id)}:{' '}
                  {d.impact
                    ? `${plural(d.impact.studentsSeen, 'alumno vio', 'alumnos vieron')} sus tarjetas`
                    : impact.isError
                      ? 'no se pudo contar'
                      : 'contando…'}{' '}
                  ({plural(d.cards, 'tarjeta que sale o cambia', 'tarjetas que salen o cambian')})
                </Reserved>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div role="group" aria-label="Ver los cambios" className="mt-4 flex flex-wrap gap-1">
        {tab('article', 'Artículos')}
        {tab('question', 'Preguntas')}
        {tab('card', 'Tarjetas')}
      </div>
      {open ? (
        <Items kind={open} assessment={a.id} fingerprint={overview.summary.fingerprint} />
      ) : null}
    </article>
  );
}

function Items({
  kind,
  assessment,
  fingerprint,
}: {
  kind: Kind;
  assessment: string;
  fingerprint: string;
}) {
  const q = useReleaseItems(fingerprint, assessment, kind);
  if (q.isError) return <ErrorWithRetry error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div aria-busy="true" className="mt-3 space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  const items: unknown[] = q.data.pages.flatMap((p): unknown[] => p.items);
  return (
    <div className="mt-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((i) =>
          kind === 'card' ? (
            <CardChange key={(i as ReleaseCardItem).guid} item={i as ReleaseCardItem} />
          ) : kind === 'article' ? (
            <ArticleChange key={(i as ReleaseArticleItem).id} item={i as ReleaseArticleItem} />
          ) : (
            <QuestionChange key={(i as ReleaseQuestionItem).key} item={i as ReleaseQuestionItem} />
          ),
        )}
      </ul>
      {q.hasNextPage ? (
        <button
          type="button"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
          className={`${button.base} ${button.secondary} mt-3 px-3 py-1.5`}
        >
          Ver más
        </button>
      ) : null}
    </div>
  );
}

/** A before and an after, word by word: what goes out struck through, what comes in underlined. */
function Diff({
  before,
  after,
}: {
  before: string | null | undefined;
  after: string | null | undefined;
}) {
  const parts = wordDiff(plainText(before), plainText(after));
  return (
    <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
      {parts.map((p, i) =>
        p.op === 'same' ? (
          <span key={i}>{p.text}</span>
        ) : p.op === 'del' ? (
          <span key={i}>
            <del className="bg-state-learn/10 text-state-learn">{p.text}</del>
            {/* What goes out and what comes in, apart. */}
            {parts[i + 1]?.op === 'add' ? ' ' : null}
          </span>
        ) : (
          <ins key={i} className="bg-state-review/10 text-state-review">
            {p.text}
          </ins>
        ),
      )}
    </p>
  );
}

function Field({
  name,
  before,
  after,
}: {
  name: string;
  before?: string | null;
  after?: string | null;
}) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted">{name}</p>
      <Diff before={before} after={after} />
    </div>
  );
}

function ItemHead({
  title,
  op,
  classification,
  children,
}: {
  title: string;
  op: ReleaseOp;
  classification: ReleaseClass | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm font-medium break-all text-ink">{title}</span>
      <Badge tone={op === 'added' ? 'new' : 'muted'}>{OP[op]}</Badge>
      {classification ? (
        <Badge tone={classTone(classification)}>{CLASS[classification]}</Badge>
      ) : null}
      {children}
    </div>
  );
}

function CardChange({ item: n }: { item: ReleaseCardItem }) {
  const version =
    n.versionBefore && n.versionAfter && n.versionBefore !== n.versionAfter
      ? ` · .${n.versionBefore} → .${n.versionAfter}`
      : '';
  const first = n.noteType?.fields[0];
  const fields =
    n.op === 'changed'
      ? n.changedFields
      : first
        ? [first]
        : Object.keys(n.fieldsAfter ?? n.fieldsBefore ?? {}).slice(0, 1);
  return (
    <li className="px-4 py-3">
      <ItemHead
        title={`${n.code ?? n.guid}${version}`}
        op={n.op}
        classification={n.classification}
      />
      {n.op === 'changed' && !n.changedFields.length ? (
        <p className="mt-1 text-sm text-muted">
          {n.classification === 'answer'
            ? 'Los campos se leen igual, pero cambia lo que muestra la tarjeta: su plantilla o una imagen.'
            : 'El texto se lee igual.'}
        </p>
      ) : null}
      {fields.map((f) => (
        <Field key={f} name={f} before={n.fieldsBefore?.[f]} after={n.fieldsAfter?.[f]} />
      ))}
      {n.cards.some((c) => c.op === 'moved' || (n.op === 'changed' && c.op !== 'changed')) ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {n.cards
            .filter((c) => c.op !== 'changed')
            .map((c) => (
              <li key={c.ord}>
                Tarjeta {c.ord + 1}:{' '}
                {c.op === 'moved'
                  ? `de «${lastName(c.deckNameBefore ?? '')}» a «${lastName(c.deckNameAfter ?? '')}»`
                  : c.op === 'added'
                    ? `nueva, en «${lastName(c.deckNameAfter ?? '')}»`
                    : `sale de «${lastName(c.deckNameBefore ?? '')}»`}
              </li>
            ))}
        </ul>
      ) : null}
    </li>
  );
}

function ArticleChange({ item: a }: { item: ReleaseArticleItem }) {
  return (
    <li className="px-4 py-3">
      <ItemHead title={`${a.id} · ${a.title}`} op={a.op} classification={a.classification} />
      {a.titleBefore && a.titleBefore !== a.title ? (
        <Field name="Título" before={a.titleBefore} after={a.title} />
      ) : null}
      {a.sections.map((s) => (
        <Field
          key={s.anchor || '_'}
          name={`${s.title}${s.op === 'added' ? ' (nueva)' : s.op === 'removed' ? ' (sale)' : ''}`}
          before={s.before}
          after={s.after}
        />
      ))}
      {a.op === 'changed' && !a.sections.length ? (
        <p className="mt-1 text-sm text-muted">El texto se lee igual.</p>
      ) : null}
    </li>
  );
}

const letter = (i: unknown) => (typeof i === 'number' ? `${String.fromCharCode(97 + i)})` : '—');
const text = (v: unknown) => (typeof v === 'string' ? v : null);

function QuestionChange({ item: q }: { item: ReleaseQuestionItem }) {
  const b = q.before ?? {};
  const a = q.after ?? {};
  const options = (o: Record<string, unknown>) =>
    Array.isArray(o.options) ? (o.options as string[]) : [];
  const n = Math.max(options(b).length, options(a).length);
  return (
    <li className="px-4 py-3">
      <ItemHead title={`${q.quizId} · ${q.id}`} op={q.op} classification={q.classification}>
        {q.keyChanged ? <Badge tone="warn">Cambia la clave</Badge> : null}
      </ItemHead>
      {q.keyChanged ? (
        <p className="mt-1 text-sm text-ink">
          La correcta era la {letter(b.correct)} y ahora es la {letter(a.correct)}
        </p>
      ) : null}
      {q.moved ? (
        <p className="mt-1 text-sm text-muted">
          Pasa de «{q.sectionBefore} · {q.groupBefore}» a «{q.sectionAfter} · {q.groupAfter}».
        </p>
      ) : null}
      {(['context', 'prompt', 'answer', 'explanation', 'origin'] as const)
        .filter((k) => q.op !== 'changed' || text(b[k]) !== text(a[k]))
        .filter((k) => text(b[k]) || text(a[k]))
        .map((k) => (
          <Field
            key={k}
            name={
              {
                context: 'Contexto',
                prompt: 'Pregunta',
                answer: 'Respuesta',
                explanation: 'Explicación',
                origin: 'Origen',
              }[k]
            }
            before={text(b[k])}
            after={text(a[k])}
          />
        ))}
      {Array.from({ length: n }, (_, i) => i)
        .filter((i) => q.op !== 'changed' || options(b)[i] !== options(a)[i])
        .map((i) => (
          <Field
            key={i}
            name={`Alternativa ${letter(i)}`}
            before={options(b)[i]}
            after={options(a)[i]}
          />
        ))}
      {q.figuresChanged ? <p className="mt-2 text-xs text-muted">Cambia una figura.</p> : null}
    </li>
  );
}

// ───────────────────────────────────────── publishing and undoing (part 3) ─────────────────────────────────────────

const when = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  }).format(new Date(iso));

const failure = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/** The popup of a confirmation (never the browser's): its title, what it does, and its two buttons. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirm,
  busy,
  busyLabel,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirm: string;
  busy: boolean;
  busyLabel: string;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          role="alertdialog"
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface p-5 shadow-soft"
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
          </Dialog.Description>
          {/* Its place is there from the start: an error does not move the buttons. */}
          <div className="mt-3 min-h-[2.5rem]">
            {error ? (
              <p role="alert" className="text-sm text-state-learn">
                {error}
              </p>
            ) : null}
          </div>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close className={`${button.base} ${button.secondary}`} disabled={busy}>
              Cancelar
            </Dialog.Close>
            <button
              type="button"
              className={`${button.base} ${button.primary}`}
              disabled={busy}
              onClick={onConfirm}
            >
              {/* The longest of the two labels keeps the width; both in one cell, the visible one centered. The
                  grid goes inside: on the button itself, button.base's inline-flex won and put them side by side. */}
              <span className="grid place-items-center">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {busyLabel.length > confirm.length ? busyLabel : confirm}
                </span>
                <span className="col-start-1 row-start-1">{busy ? busyLabel : confirm}</span>
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** What a publication brings, by assessment, in a line each (the popup of «Publicar»). */
function releaseLines(s: ReleaseOverview['summary'], indexLines: string[]): string[] {
  const parts = (list: [number, string, string][]) =>
    list.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));
  const lines = s.assessments
    .filter((a) => !onlyInCatalog(s, a))
    .map((a) => {
      const what = [
        ...parts([
          [a.articles.added, 'artículo nuevo', 'artículos nuevos'],
          [a.articles.content + a.articles.format, 'artículo cambiado', 'artículos cambiados'],
          [a.articles.removed, 'artículo que sale', 'artículos que salen'],
          [a.cards.added, 'tarjeta nueva', 'tarjetas nuevas'],
          [
            a.cards.answer,
            'tarjeta que puede cambiar la respuesta',
            'tarjetas que pueden cambiar la respuesta',
          ],
          [a.cards.noAnswer + a.cards.format, 'tarjeta corregida', 'tarjetas corregidas'],
          [a.cards.moved, 'tarjeta que cambia de mazo', 'tarjetas que cambian de mazo'],
          [a.cards.removed, 'tarjeta que sale', 'tarjetas que salen'],
          [a.questions.added, 'pregunta nueva', 'preguntas nuevas'],
          [
            a.questions.answer,
            'pregunta que puede cambiar la respuesta',
            'preguntas que pueden cambiar la respuesta',
          ],
          [a.questions.noAnswer + a.questions.format, 'pregunta corregida', 'preguntas corregidas'],
          [a.questions.removed, 'pregunta que sale', 'preguntas que salen'],
        ]),
      ];
      return `${a.courseName ?? a.courseId} · ${a.name ?? a.id}: ${what.length ? what.join(', ') : 'cambios menores'}.`;
    });
  const site = s.catalog.length + s.noteTypes.length + s.presets.length + s.decks.length;
  if (site)
    lines.push(
      `Además, ${plural(site, 'cambio', 'cambios')} del catálogo o de los mazos de arriba.`,
    );
  return [...lines, ...indexLines];
}

/** «Publicar» under the review list: enabled only when the list is ready, with its confirmation popup. */
function PublishBar({ review, overview }: { review: ReviewList; overview: ReleaseOverview }) {
  const [open, setOpen] = useState(false);
  const indexLines = useIndexLines(overview);
  const publish = usePublishRelease();
  const warnings = review.checks.filter((c) => c.severity === 'warn' && c.items.length).length;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) publish.reset();
  };
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        className={`${button.base} ${button.primary}`}
        disabled={!review.ready}
        onClick={() => close(true)}
      >
        Publicar
      </button>
      <Reserved
        longest="Se habilita cuando nada lo impide y están las marcas a mano."
        className="min-w-0 flex-1 text-sm text-muted"
      >
        <p>
          {review.ready
            ? 'Todo el borrador pasa a lo publicado de una vez. Se puede deshacer.'
            : 'Se habilita cuando nada lo impide y están las marcas a mano.'}
        </p>
      </Reserved>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title="¿Publicar el borrador?"
        confirm="Publicar"
        busy={publish.isPending}
        busyLabel="Publicando…"
        error={
          publish.isError
            ? failure(publish.error, 'No se pudo publicar. Inténtalo de nuevo.')
            : null
        }
        onConfirm={() => publish.mutate({ overview, review }, { onSuccess: () => close(false) })}
      >
        <p className="font-medium text-ink">{releaseTitle(overview.summary)}</p>
        <ul className="list-disc space-y-1 pl-5">
          {releaseLines(overview.summary, indexLines).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {warnings ? (
          <p>
            {warnings === 1
              ? 'La lista de revisión tiene 1 aviso.'
              : `La lista de revisión tiene ${warnings} avisos.`}
          </p>
        ) : null}
        <p>
          Los alumnos ven todo lo nuevo de una vez, al terminar. Su avance no cambia: las tarjetas
          que se mueven o salen se ordenan solas cuando entran. Mientras sea la última, la puedes
          deshacer.
        </p>
      </ConfirmDialog>
    </div>
  );
}

const releaseLine = (r: ReleaseRecord) =>
  r.status === 'reverted' && r.revertedAt
    ? `Deshecha el ${when(r.revertedAt)}${r.revertedBy ? ` por ${r.revertedBy}` : ''}.`
    : `Publicada el ${when(r.publishedAt)} por ${r.publishedBy}.`;

/** The last publication, in a card of a fixed height, with «Deshacer la última publicación» and its popup. */
function LastRelease() {
  const log = useReleaseLog();
  const revert = useRevertRelease();
  const [open, setOpen] = useState(false);
  const last = log.data?.releases[0] ?? null;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) revert.reset();
  };
  return (
    <section
      aria-labelledby="last-release"
      className={`${card} mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5`}
    >
      <div className="min-w-0 flex-1">
        <h3 id="last-release" className="font-semibold">
          Última publicación
        </h3>
        <Reserved
          longest="N.º 9999 · Biología celular y molecular · Certamen 2, Anatomía II · Certamen 3 y 12 más. Publicada el 30 de septiembre de 2026, 23:59 por alguien.largo@ug.uchile.cl."
          className="mt-1 text-sm text-muted"
        >
          {log.isError ? (
            <p role="alert">No se pudo leer el registro. Recarga la página.</p>
          ) : !log.data ? (
            <Skeleton className="h-4 w-3/4" />
          ) : last ? (
            <p role="status">
              <span className="text-ink">
                N.º {last.id} · {last.title}.
              </span>{' '}
              {releaseLine(last)}
            </p>
          ) : (
            <p role="status">Todavía no hay publicaciones.</p>
          )}
        </Reserved>
      </div>
      <button
        type="button"
        className={`${button.base} ${button.secondary} flex-none`}
        disabled={!last?.canRevert}
        onClick={() => close(true)}
      >
        Deshacer la última publicación
      </button>
      {last ? (
        <ConfirmDialog
          open={open}
          onOpenChange={close}
          title={`¿Deshacer la publicación n.º ${last.id}?`}
          confirm="Deshacer"
          busy={revert.isPending}
          busyLabel="Deshaciendo…"
          error={
            revert.isError
              ? failure(revert.error, 'No se pudo deshacer. Inténtalo de nuevo.')
              : null
          }
          onConfirm={() => revert.mutate(last.id, { onSuccess: () => close(false) })}
        >
          <p className="font-medium text-ink">{last.title}</p>
          <p>
            Lo publicado vuelve a ser lo de antes, tal cual. El borrador conserva lo deshecho: lo
            puedes corregir y publicar de nuevo, o descartar.
          </p>
          <p>
            Los alumnos que ya lo estudiaron conservan su avance; las tarjetas vuelven a su lugar
            cuando entran.
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

/** Every publication, newest first. */
function ReleaseLogSection() {
  const log = useReleaseLog();
  return (
    <section aria-labelledby="release-log" className="mt-10">
      <h3 id="release-log" className="text-lg font-semibold">
        Registro de publicaciones
      </h3>
      {log.isError ? (
        <div className="mt-3">
          <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
        </div>
      ) : !log.data ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : log.data.releases.length ? (
        <ul className={`${card} mt-3 divide-y divide-border`}>
          {log.data.releases.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5" data-release={r.id}>
              <span className="w-14 flex-none text-sm font-semibold text-ink">N.º {r.id}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block break-words text-ink">{r.title}</span>
                <span className="block text-muted">{releaseLine(r)}</span>
              </span>
              <Badge tone={r.status === 'published' ? 'new' : 'muted'}>
                {r.status === 'published' ? 'Publicada' : 'Deshecha'}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${card} mt-3 p-5 text-sm text-muted`}>Todavía no hay publicaciones.</p>
      )}
    </section>
  );
}
