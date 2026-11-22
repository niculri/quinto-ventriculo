// The only place the web puts HTML into the page, and only HTML a sanitizer gave (`SanitizedHtml`).

import { createElement } from 'react';
import type { Ref, TdHTMLAttributes } from 'react';
import type { SanitizedHtml } from '../lib/sanitizedHtml';

type Tag = 'span' | 'div' | 'p' | 'h1' | 'h2' | 'dd' | 'td' | 'th';

interface Props
  extends Omit<TdHTMLAttributes<HTMLElement>, 'children' | 'dangerouslySetInnerHTML'> {
  html: SanitizedHtml;
  as?: Tag;
  ref?: Ref<HTMLElement>;
}

export function SafeHtml({ html, as = 'span', ...rest }: Props) {
  return createElement(as, { ...rest, dangerouslySetInnerHTML: { __html: html } });
}
