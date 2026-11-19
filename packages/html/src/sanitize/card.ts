// Sanitizes the HTML of a rendered card for the web and points its images at the image store.
import sanitizeHtml from 'sanitize-html';
import { CARD_SAFE_VALUE, STYLE_PROPERTIES } from './css';

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
    '*': ['class', 'id', 'style', 'title', 'lang', 'dir', 'hidden', 'data-*'],
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
  // sanitize-html drops an empty `hidden` unless it is listed (and `alt` keeps its default).
  allowedEmptyAttributes: ['alt', 'hidden'],
  allowedStyles: { '*': Object.fromEntries(STYLE_PROPERTIES.map((p) => [p, [CARD_SAFE_VALUE]])) },
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

/** Only the key of the stored image is read: the importer passes its processed images. */
export type ImageResolver = (name: string) => Promise<{ key: string } | null>;

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
  const images = new Map<string, { key: string } | null>();
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
