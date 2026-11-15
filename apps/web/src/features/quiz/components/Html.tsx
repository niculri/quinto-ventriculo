// A test's text as sanitized HTML (bold, italics, superscripts, subscripts and line breaks only).
import { cleanText } from '../model/html';

export function Html({
  html,
  as: Tag = 'span',
  className,
  id,
}: {
  html: string;
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'dd';
  className?: string;
  id?: string;
}) {
  return (
    <Tag id={id} className={className} dangerouslySetInnerHTML={{ __html: cleanText(html) }} />
  );
}
