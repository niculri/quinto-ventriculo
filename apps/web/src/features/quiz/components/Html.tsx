// A test's text as sanitized HTML (bold, italics, superscripts, subscripts and line breaks only).
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { cleanText } from '../model/html';

export function Html({
  html,
  as = 'span',
  className,
  id,
}: {
  html: string;
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'dd';
  className?: string;
  id?: string;
}) {
  return <SafeHtml as={as} id={id} className={className} html={cleanText(html)} />;
}
