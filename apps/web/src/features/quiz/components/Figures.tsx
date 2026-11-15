// A question's figures (inline SVG or a photo that opens bigger) and its table, sanitized.
import type { QuizFigure, QuizTable } from '@qv/schema';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { commonCaption, shownHeight } from '../model/figures';
import { cleanSvg, cleanText } from '../model/html';
import { quizStrings as s } from '../strings';

function Figure({ figure: f, onZoom }: { figure: QuizFigure; onZoom: (image: OpenImage) => void }) {
  return f.kind === 'svg' ? (
    <span className="fsvg" dangerouslySetInnerHTML={{ __html: cleanSvg(f.svg) }} />
  ) : (
    <button
      type="button"
      className="fbtn"
      aria-label={s.figures.zoom(f.alt)}
      onClick={() => onZoom({ src: f.src ?? '', alt: f.alt, caption: f.caption ?? '' })}
    >
      <img
        className="fimg"
        src={f.src}
        alt={f.alt}
        width={f.displayWidth ?? f.width}
        height={shownHeight(f)}
        loading="lazy"
      />
    </button>
  );
}

export function Figures({
  figures,
  onZoom,
}: {
  figures: QuizFigure[];
  onZoom: (image: OpenImage) => void;
}) {
  const common = commonCaption(figures);
  return (
    <>
      {figures.map((f, i) =>
        f.caption && !common ? (
          <div key={i} className="fcon">
            <Figure figure={f} onZoom={onZoom} />
            <span className="fpie">{f.caption}</span>
          </div>
        ) : (
          <span key={i} className="fsvg">
            <Figure figure={f} onZoom={onZoom} />
          </span>
        ),
      )}
      {common ? <span className="fpie todo">{common}</span> : null}
    </>
  );
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
