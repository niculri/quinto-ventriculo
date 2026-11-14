// HTML to plain text without a parser, in the forms that have to stay as they are: two of them mirror a function of
// the content database, and they differ from each other (test/golden/text.json).

/** Like `release_text()` in SQL: only what looks like a tag goes (a loose «p<0.05 y q>1» is text). */
export function releasePlainText(html: string | null | undefined): string {
  return (html ?? '')
    .replace(
      /<(?:img|video|audio|source|embed)\b[^>]*\b(?:data-media|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>/gi,
      (_m, a?: string, b?: string, c?: string) => ` [img ${a ?? b ?? c ?? ''}] `,
    )
    .replace(/<\/?[a-z][^>]*>|<![^>]*>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Has to match `anki_plain_text()` of the content database. */
export function ankiPlainText(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The report titles of the web: tags go without a space, and «&amp;» is decoded before the other entities. */
export function reportPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
