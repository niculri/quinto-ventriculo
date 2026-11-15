// A card, an article or a question that changes: what it is, how it changes, and each field with its before and after.
import type { ReactNode } from 'react';
import { releasePlainText as plainText } from '@qv/html/text';
import { lastName, wordDiff } from '@qv/release-review';
import type {
  ReleaseArticleItem,
  ReleaseCardItem,
  ReleaseClass,
  ReleaseOp,
  ReleaseQuestionItem,
} from '@qv/schema';
import { classTone, letter, textOf } from '../../model/releases';
import { releasesStrings } from '../../releases.strings';
import { Badge } from './Badge';

const s = releasesStrings.items;

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
      <Badge tone={op === 'added' ? 'new' : 'muted'}>{releasesStrings.ops[op]}</Badge>
      {classification ? (
        <Badge tone={classTone(classification)}>{releasesStrings.classes[classification]}</Badge>
      ) : null}
      {children}
    </div>
  );
}

function CardMoves({ item: n }: { item: ReleaseCardItem }) {
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-muted">
      {n.cards
        .filter((c) => c.op !== 'changed')
        .map((c) => (
          <li key={c.ord}>
            {s.card(c.ord + 1)}
            {c.op === 'moved'
              ? s.cardMoved(lastName(c.deckNameBefore ?? ''), lastName(c.deckNameAfter ?? ''))
              : c.op === 'added'
                ? s.cardAdded(lastName(c.deckNameAfter ?? ''))
                : s.cardRemoved(lastName(c.deckNameBefore ?? ''))}
          </li>
        ))}
    </ul>
  );
}

export function CardChange({ item: n }: { item: ReleaseCardItem }) {
  const version =
    n.versionBefore && n.versionAfter && n.versionBefore !== n.versionAfter
      ? s.version(n.versionBefore, n.versionAfter)
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
          {n.classification === 'answer' ? s.sameFieldsOtherLook : s.sameText}
        </p>
      ) : null}
      {fields.map((f) => (
        <Field key={f} name={f} before={n.fieldsBefore?.[f]} after={n.fieldsAfter?.[f]} />
      ))}
      {n.cards.some((c) => c.op === 'moved' || (n.op === 'changed' && c.op !== 'changed')) ? (
        <CardMoves item={n} />
      ) : null}
    </li>
  );
}

export function ArticleChange({ item: a }: { item: ReleaseArticleItem }) {
  return (
    <li className="px-4 py-3">
      <ItemHead title={s.title2(a.id, a.title)} op={a.op} classification={a.classification} />
      {a.titleBefore && a.titleBefore !== a.title ? (
        <Field name={s.title} before={a.titleBefore} after={a.title} />
      ) : null}
      {a.sections.map((sec) => (
        <Field
          key={sec.anchor || '_'}
          name={s.section(sec.title, sec.op)}
          before={sec.before}
          after={sec.after}
        />
      ))}
      {a.op === 'changed' && !a.sections.length ? (
        <p className="mt-1 text-sm text-muted">{s.sameText}</p>
      ) : null}
    </li>
  );
}

const QUESTION_FIELDS = ['context', 'prompt', 'answer', 'explanation', 'origin'] as const;

const optionsOf = (o: Record<string, unknown>) =>
  Array.isArray(o.options) ? (o.options as string[]) : [];

export function QuestionChange({ item: q }: { item: ReleaseQuestionItem }) {
  const b = q.before ?? {};
  const a = q.after ?? {};
  const n = Math.max(optionsOf(b).length, optionsOf(a).length);
  return (
    <li className="px-4 py-3">
      <ItemHead title={s.title2(q.quizId, q.id)} op={q.op} classification={q.classification}>
        {q.keyChanged ? <Badge tone="warn">{s.keyChanged}</Badge> : null}
      </ItemHead>
      {q.keyChanged ? (
        <p className="mt-1 text-sm text-ink">
          {s.correctWas(letter(b.correct), letter(a.correct))}
        </p>
      ) : null}
      {q.moved ? (
        <p className="mt-1 text-sm text-muted">
          {s.movedFrom(
            s.where(q.sectionBefore, q.groupBefore),
            s.where(q.sectionAfter, q.groupAfter),
          )}
        </p>
      ) : null}
      {QUESTION_FIELDS.filter((k) => q.op !== 'changed' || textOf(b[k]) !== textOf(a[k]))
        .filter((k) => textOf(b[k]) || textOf(a[k]))
        .map((k) => (
          <Field key={k} name={s.fields[k]} before={textOf(b[k])} after={textOf(a[k])} />
        ))}
      {Array.from({ length: n }, (_, i) => i)
        .filter((i) => q.op !== 'changed' || optionsOf(b)[i] !== optionsOf(a)[i])
        .map((i) => (
          <Field
            key={i}
            name={s.option(letter(i))}
            before={optionsOf(b)[i]}
            after={optionsOf(a)[i]}
          />
        ))}
      {q.figuresChanged ? <p className="mt-2 text-xs text-muted">{s.figure}</p> : null}
    </li>
  );
}
