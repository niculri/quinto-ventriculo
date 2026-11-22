// A question's figures (inline SVG or a photo that opens bigger) and its table, sanitized.
import type { QuizFigure, QuizTable } from '@qv/schema';
import { keyed } from '../../../shared/lib/keyed';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { commonCaption, shownHeight } from '../model/figures';
import { cleanSvg, cleanText } from '../model/html';
import { figuresStrings as s } from './strings/Figures.strings';

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
      {keyed(figures, (f) => (f.kind === 'svg' ? f.svg : (f.src ?? f.alt))).map(
        ({ key, item: f }) =>
          f.caption && !common ? (
            <div key={key} className="fcon">
              <Figure figure={f} onZoom={onZoom} />
              <span className="fpie">{f.caption}</span>
            </div>
          ) : (
            <span key={key} className="fsvg">
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
          {keyed(table.rows, (row) => row.map((c) => c.html).join('|')).map(
            ({ key: rowKey, item: row }) => (
              <tr key={rowKey}>
                {keyed(row, (c) => c.html).map(({ key, item: c }) => {
                  const Tag = c.header ? 'th' : 'td';
                  const cls = [c.highlight ? 'hl' : '', c.empty ? 'vacia' : '']
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <Tag
                      key={key}
                      colSpan={c.colSpan}
                      rowSpan={c.rowSpan}
                      className={cls || undefined}
                      dangerouslySetInnerHTML={{ __html: cleanText(c.html) }}
                    />
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </>
  );
}
