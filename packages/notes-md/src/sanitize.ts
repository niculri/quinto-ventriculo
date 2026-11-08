import sanitizeHtml from 'sanitize-html';

/**
 * Allow list for the notes' HTML. The Markdown is ours, but the HTML is stored in the database and injected
 * into the page: it is sanitized anyway, in case a note brings unexpected raw HTML.
 */
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
  // Only the classes the converter adds. Any other one could be one of the web's (Tailwind: «fixed
  // inset-0 z-50») and raw HTML in a note would cover the page with it.
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

export function sanitize(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
