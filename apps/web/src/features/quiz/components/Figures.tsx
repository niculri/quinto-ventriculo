// Rendering of a test's rich content: figures, tables, sanitized HTML and statements «I. …, II. …» as a list.
import type { CSSProperties } from 'react';
import { splitStatements } from '@qv/quiz';
import type { QuizFigure, QuizTable } from '@qv/schema';
import { cleanSvg, cleanText } from '../model/html';
import type { OpenImage } from '../../../shared/ui/ImageViewer';

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
