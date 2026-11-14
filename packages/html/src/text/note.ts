// A note's HTML to plain text (headings, captions, search): block ends become spaces, every entity is decoded.
import { decodeHTML } from 'entities';

/** The text of a note's heading, caption or section, for the table of contents, `alt` and the search. */
export function notePlainText(html: string): string {
  const withoutTags = html
    .replace(/<(?:br|\/p|\/li|\/h\d|\/tr|\/td|\/th|\/figcaption)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeHTML(withoutTags).replace(/\s+/g, ' ').trim();
}
