// The CSS values the sanitizers accept: one check for a card's inline style and another for an SVG presentation
// attribute. They accept different values (test/golden/css.json), so they stay two.

/** A CSS value without anything that loads or runs something (url(), expression(), javascript:). */
export const CARD_SAFE_VALUE =
  /^(?!.*(?:url|expression|image-set|image|element|paint)\s*\()(?!.*javascript:)[^<>"\\{};]*$/i;

export const STYLE_PROPERTIES = [
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

/** No `url(`, `javascript:` or backslash: presentation attributes are read as CSS, where `u\72 l(` is `url(`. */
export const SVG_SAFE_VALUE =
  /^(?![\s\S]*javascript:)(?![\s\S]*url\s*\()(?![\s\S]*expression\s*\()(?![\s\S]*\\)/i;
