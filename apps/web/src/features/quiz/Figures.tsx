import type { CSSProperties } from 'react';
import { splitStatements } from '@qv/quiz';
import type { QuizFigure, QuizTable } from '@qv/schema';
import { cleanSvg, cleanText } from './html';
import type { OpenImage } from '../notes/ImageViewer';

/**
 * The figures of a question, side by side (one over the other on a phone), each with its caption. Several
 * with the same caption share one, under all of them (a figure of two panels). As the skill's page.
 */
export function Figures({
  figures,
  onZoom,
}: {
  figures: QuizFigure[];
  onZoom: (image: OpenImage) => void;
}) {
  const common =
    figures.length > 1 && figures.every((f) => f.caption && f.caption === figures[0]!.caption)
      ? figures[0]!.caption!
      : '';
  return (
    <>
      {figures.map((f, i) => {
        const body =
          f.kind === 'svg' ? (
            <span className="fsvg" dangerouslySetInnerHTML={{ __html: cleanSvg(f.svg) }} />
          ) : (
            <button
              type="button"
              className="fbtn"
              aria-label={`Ampliar la imagen${f.alt ? `: ${f.alt}` : ''}`}
              onClick={() => onZoom({ src: f.src ?? '', alt: f.alt, caption: f.caption ?? '' })}
            >
              <img
                className="fimg"
                src={f.src}
                alt={f.alt}
                width={f.displayWidth ?? f.width}
                height={
                  f.displayWidth ? Math.round((f.height / f.width) * f.displayWidth) : f.height
                }
                loading="lazy"
              />
            </button>
          );
        return f.caption && !common ? (
          <div key={i} className="fcon">
            {body}
            <span className="fpie">{f.caption}</span>
          </div>
        ) : (
          <span key={i} className="fsvg">
            {body}
          </span>
        );
      })}
      {common ? <span className="fpie todo">{common}</span> : null}
    </>
  );
}

/** The figure column beside the alternatives: the first figure's «ancho» (up to 58 %), 42 % without it. */
export function besideStyle(figures: QuizFigure[]): CSSProperties | undefined {
  const w = figures[0]?.displayWidth;
  return w ? ({ '--fw': `min(${w}px, 58%)` } as CSSProperties) : undefined;
}

export function Table({ table }: { table: QuizTable }) {
  return (
    <>
      {table.title ? (
        <div className="tcap" dangerouslySetInnerHTML={{ __html: cleanText(table.title) }} />
      ) : null}
      <table>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => {
                const Tag = c.header ? 'th' : 'td';
                const cls = [c.highlight ? 'hl' : '', c.empty ? 'vacia' : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <Tag
                    key={j}
                    colSpan={c.colSpan}
                    rowSpan={c.rowSpan}
                    className={cls || undefined}
                    dangerouslySetInnerHTML={{ __html: cleanText(c.html) }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** HTML of a text of the test (already safe; sanitized again). */
export function Html({
  html,
  as: Tag = 'span',
  className,
  id,
}: {
  html: string;
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'dd';
  className?: string;
  id?: string;
}) {
  return (
    <Tag id={id} className={className} dangerouslySetInnerHTML={{ __html: cleanText(html) }} />
  );
}

/**
 * A text that may bring statements «I. …», «II. …» one per line: the statements go as a list of their own,
 * each one with its numeral aligned and a hanging indent, between the text before and after them (the
 * owner, 2026-11-01). Without statements, the text as it is.
 */
export function TextWithStatements({
  html,
  className,
  as = 'p',
}: {
  html: string;
  className: string;
  as?: 'p' | 'h2' | 'div';
}) {
  const split = splitStatements(html);
  if (!split) return <Html as={as} className={className} html={html} />;
  return (
    <>
      {split.before ? <Html as={as} className={className} html={split.before} /> : null}
      <ol className="afirm" aria-label="Afirmaciones">
        {split.items.map((s, i) => (
          <li key={i}>
            <span className="rn" aria-hidden="true">
              {s.numeral}.
            </span>
            <Html className="rt" html={s.html} />
          </li>
        ))}
      </ol>
      {split.after ? (
        <Html as={as === 'h2' ? 'p' : as} className={className} html={split.after} />
      ) : null}
    </>
  );
}
