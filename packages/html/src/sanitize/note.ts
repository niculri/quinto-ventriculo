// Sanitizes a note's HTML with an allow list, since it is stored and injected into the page as it is.
import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'sup',
    'sub',
    'br',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'figure',
    'figcaption',
    'img',
    'div',
    'aside',
    'section',
    'span',
    'a',
    'code',
    'pre',
    'blockquote',
    'mark',
    'small',
  ],
  allowedAttributes: {
    '*': ['class'],
    h2: ['id', 'class'],
    h3: ['id', 'class'],
    h4: ['id', 'class'],
    img: ['data-media', 'alt', 'width', 'height', 'loading', 'decoding'],
    a: ['href'],
    th: ['colspan', 'rowspan', 'style'],
    td: ['colspan', 'rowspan', 'style'],
    figure: ['class', 'style'],
    ol: ['start'],
  },
  allowedStyles: {
    figure: { width: [/^\d{1,3}%$/] },
    th: { 'text-align': [/^(left|right|center)$/] },
    td: { 'text-align': [/^(left|right|center)$/] },
  },
  allowedSchemes: ['https'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // Only the converter's classes: a web class in raw HTML («fixed inset-0 z-50») could cover the page.
  allowedClasses: {
    '*': [
      /^callout(?:-[a-z]+)?$/,
      /^figure(?:-[a-z]+)?$/,
      /^side(?:-right|-left)?$/,
      'source',
      'missing-image',
      'note-summary',
    ],
  },
};

export function sanitizeNote(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
