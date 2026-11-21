// Sanitizes a test's SVG figure to drawing tags and attributes, with no value that loads anything.
import sanitizeHtml from 'sanitize-html';
import { SVG_SAFE_VALUE } from './css';

const SVG_TAGS = [
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'tspan',
  'title',
];
const SVG_ATTRIBUTES = [
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'dx',
  'dy',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'preserveAspectRatio',
  'role',
  'aria-label',
  'aria-hidden',
  'xmlns',
];

const SVG_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: SVG_TAGS,
  allowedAttributes: Object.fromEntries(SVG_TAGS.map((t) => [t, SVG_ATTRIBUTES])),
  allowedSchemes: [],
  selfClosing: SVG_TAGS.filter((t) => !['svg', 'g', 'text', 'tspan', 'title'].includes(t)),
  parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
  exclusiveFilter: () => false,
  transformTags: {
    '*': (tagName, attribs) => ({
      tagName,
      attribs: Object.fromEntries(
        Object.entries(attribs).filter(([, v]) => SVG_SAFE_VALUE.test(v)),
      ),
    }),
  },
};

/** Keeps only drawing tags and attributes; `dropped` warns that the figure may not look like the original. */
export function sanitizeSvg(svg: string): { svg: string; dropped: string[] } {
  const clean = sanitizeHtml(svg.trim(), SVG_OPTIONS);
  const dropped: string[] = [];
  const tags = (s: string) => [...s.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
  const attrs = (s: string) => [...s.matchAll(/\s([a-zA-Z][\w:-]*)="/g)].map((m) => m[1]!);
  const before = tags(svg);
  const after = tags(clean);
  if (before.length !== after.length) {
    const lost = before.filter((t) => !SVG_TAGS.includes(t));
    dropped.push(
      `etiquetas quitadas: ${[...new Set(lost)].join(', ') || before.length - after.length}`,
    );
  }
  const ab = attrs(svg);
  const aa = attrs(clean);
  if (ab.length !== aa.length) {
    const lost = ab.filter((a) => !SVG_ATTRIBUTES.includes(a));
    dropped.push(`atributos quitados: ${[...new Set(lost)].join(', ') || ab.length - aa.length}`);
  }
  return { svg: clean, dropped };
}
