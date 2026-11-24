// A question's figures (inline SVG or a photo that opens bigger) and its table, sanitized.
import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QuizFigure, QuizTable } from '@qv/schema';
import { drawnWidth } from '../../../shared/lib/drawnWidth';
import { keyed } from '../../../shared/lib/keyed';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { commonCaption, shownHeight } from '../model/figures';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { MediaFallback } from '../../../shared/ui/MediaFallback';
import { useSignedImage } from '../../../shared/hooks/useSignedImage';
import { renewFromCache } from '../../../shared/lib/mediaRenewal';
import { cleanSvg, cleanText } from '../model/html';
import { figuresStrings as s } from './strings/Figures.strings';

type PhotoFigure = Exclude<QuizFigure, { kind: 'svg' }>;

function Figure({ figure: f, onZoom }: { figure: QuizFigure; onZoom: (image: OpenImage) => void }) {
  return f.kind === 'svg' ? (
    <SafeHtml className="fsvg" html={cleanSvg(f.svg)} />
  ) : (
    <Photo figure={f} onZoom={onZoom} />
  );
}

/** A photo opens bigger; one whose signed link fails is signed again with the section, or shows a notice. */
function Photo({ figure: f, onZoom }: { figure: PhotoFigure; onZoom: (image: OpenImage) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const image = useSignedImage(f.src, renewFromCache(useQueryClient()), buttonRef);
  const width = f.displayWidth ?? f.width;
  const height = shownHeight(f);
  const photo = (
    <img
      key={image.attempt}
      className="fimg"
      src={image.src}
      alt={f.alt}
      width={width}
      height={height}
      loading={image.failure ? 'eager' : 'lazy'}
      style={image.failure ? { display: 'none' } : undefined}
      onError={image.onError}
      onLoad={image.onLoad}
    />
  );
  if (image.failure) {
    return (
      <MediaFallback
        alt={f.alt}
        width={width}
        height={height}
        retrying={image.failure.retrying}
        onRetry={image.retry}
      >
        {image.failure.retrying ? photo : null}
      </MediaFallback>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className="fbtn"
      aria-label={s.figures.zoom(f.alt)}
      onClick={(e) =>
        onZoom({
          src: image.src ?? '',
          alt: f.alt,
          caption: f.caption ?? '',
          // The photo's own frame (padding and border) is not drawn in the viewer.
          shown: drawnWidth(e.currentTarget.querySelector('img')!),
        })
      }
    >
      {photo}
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
      {keyed(figures, (f) => (f.kind === 'svg' ? f.svg : f.media)).map(({ key, item: f }) =>
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
