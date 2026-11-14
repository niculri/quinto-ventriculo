// Sanitizes the HTML of a rendered card for the web and points its images at the image store.
import sanitizeHtml from 'sanitize-html';
import type { ProcessedImage } from './images';

/** A CSS value without anything that loads or runs something (url(), expression(), javascript:). */
const SAFE_VALUE =
  /^(?!.*(?:url|expression|image-set|image|element|paint)\s*\()(?!.*javascript:)[^<>"\\{};]*$/i;

const STYLE_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'text-align',
  'text-decoration',
  'text-transform',
  'text-indent',
  'letter-spacing',
  'line-height',
  'white-space',
  'vertical-align',
  'display',
  'visibility',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'border-collapse',
  'float',
  'clear',
  'opacity',
  'list-style',
  'list-style-type',
  'direction',
  'unicode-bidi',
];

/** Unlike the notes', a card keeps what its note type's CSS and Image Occlusion need; scripts and handlers go away. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'div',
    'span',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'strike',
    'del',
    'ins',
    'sup',
    'sub',
    'small',
    'big',
    'mark',
    'font',
    'center',
    'blockquote',
    'pre',
    'code',
    'kbd',
    'abbr',
    'cite',
    'q',
    'ruby',
    'rb',
    'rt',
    'rp',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'col',
    'colgroup',
    'figure',
    'figcaption',
    'img',
    'a',
    'details',
    'summary',
    'section',
    'article',
    'header',
    'footer',
    'aside',
    'canvas',
    'button',
    'wbr',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'title', 'lang', 'dir', 'data-*'],
    img: ['data-media', 'alt', 'width', 'height'],
    a: ['href', 'draggable'],
    font: ['color', 'face', 'size'],
    td: ['colspan', 'rowspan', 'align', 'valign', 'width'],
    th: ['colspan', 'rowspan', 'align', 'valign', 'width'],
    table: ['border', 'cellpadding', 'cellspacing', 'width', 'align'],
    col: ['span', 'width'],
    ol: ['start', 'type'],
    button: ['type'],
    canvas: ['width', 'height'],
  },
  allowedStyles: { '*': Object.fromEntries(STYLE_PROPERTIES.map((p) => [p, [SAFE_VALUE]])) },
  allowedSchemes: ['https'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // Inside the Shadow DOM classes cannot reach the page: any class of the note type is fine.
  allowedClasses: undefined,
};

export interface SanitizedCard {
  html: string;
  media: string[];
  missing: string[];
}

export type ImageResolver = (name: string) => Promise<ProcessedImage | null>;

/** Each `<img src="file">` becomes `data-media="cards/<hash>.webp"`, which the API turns into a signed URL. */
export async function sanitizeCard(
  html: string,
  resolveImage: ImageResolver,
): Promise<SanitizedCard> {
  const names = new Set<string>();
  sanitizeHtml(html, {
    ...OPTIONS,
    allowedAttributes: { img: ['src'] },
    transformTags: {
      img: (tag, attribs) => {
        if (attribs['src']) names.add(attribs['src']);
        return { tagName: tag, attribs };
      },
    },
  });
  const images = new Map<string, ProcessedImage | null>();
  for (const name of names) {
    images.set(name, isRemote(name) ? null : await resolveImage(name));
  }
  const media = new Set<string>();
  const missing = new Set<string>();
  const clean = sanitizeHtml(html, {
    ...OPTIONS,
    transformTags: {
      img: (tag, attribs) => {
        // A «data-media» of the field itself does not pass: the API signs every one it finds.
        const { src, 'data-media': _own, ...rest } = attribs;
        const found = src ? images.get(src) : null;
        if (found) {
          media.add(found.key);
          return { tagName: tag, attribs: { ...rest, 'data-media': found.key } };
        }
        if (src) missing.add(src);
        return { tagName: tag, attribs: { ...rest, alt: `[imagen no encontrada: ${src ?? ''}]` } };
      },
      // Runs after the one of <img>: only the images keep the «data-media» set above.
      '*': (tag, attribs) => {
        if (tag === 'img' || !('data-media' in attribs)) return { tagName: tag, attribs };
        const { 'data-media': _own, ...rest } = attribs;
        return { tagName: tag, attribs: rest };
      },
    },
  });
  return { html: clean, media: [...media], missing: [...missing] };
}

function isRemote(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//');
}
