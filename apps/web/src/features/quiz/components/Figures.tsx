// A question's figures (inline SVG or a photo that opens bigger) and its table, sanitized.
import type { QuizFigure, QuizTable } from '@qv/schema';
import { drawnWidth } from '../../../shared/lib/drawnWidth';
import { keyed } from '../../../shared/lib/keyed';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { commonCaption, shownHeight } from '../model/figures';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { cleanSvg, cleanText } from '../model/html';
import { figuresStrings as s } from './strings/Figures.strings';

function Figure({ figure: f, onZoom }: { figure: QuizFigure; onZoom: (image: OpenImage) => void }) {
  return f.kind === 'svg' ? (
    <SafeHtml className="fsvg" html={cleanSvg(f.svg)} />
  ) : (
    <button
      type="button"
      className="fbtn"
      aria-label={s.figures.zoom(f.alt)}
      onClick={(e) =>
        onZoom({
          src: f.src ?? '',
          alt: f.alt,
          caption: f.caption ?? '',
          // The photo's own frame (padding and border) is not drawn in the viewer.
          shown: drawnWidth(e.currentTarget.querySelector('img')!),
        })
      }
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
      {table.title ? <SafeHtml as="div" className="tcap" html={cleanText(table.title)} /> : null}
      <table>
        <tbody>
          {keyed(table.rows, (row) => row.map((c) => c.html).join('|')).map(
            ({ key: rowKey, item: row }) => (
              <tr key={rowKey}>
                {keyed(row, (c) => c.html).map(({ key, item: c }) => {
                  const cls = [c.highlight ? 'hl' : '', c.empty ? 'vacia' : '']
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <SafeHtml
                      as={c.header ? 'th' : 'td'}
                      key={key}
                      colSpan={c.colSpan}
                      rowSpan={c.rowSpan}
                      className={cls || undefined}
                      html={cleanText(c.html)}
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
