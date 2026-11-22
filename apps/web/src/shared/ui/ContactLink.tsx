// The contact address as a `mailto:` link, also inside a notice's text.
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { CONTACT_EMAIL } from '@qv/schema';
import { keyed } from '../lib/keyed';

export function ContactLink() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium break-all text-brand underline underline-offset-2"
    >
      {CONTACT_EMAIL}
    </a>
  );
}

export function withContactLink(text: string): ReactNode {
  const parts = text.split(CONTACT_EMAIL);
  if (parts.length === 1) return text;
  return keyed(parts, (part) => part).map(({ key, item: part }, i) => (
    <Fragment key={key}>
      {i > 0 ? <ContactLink /> : null}
      {part}
    </Fragment>
  ));
}
