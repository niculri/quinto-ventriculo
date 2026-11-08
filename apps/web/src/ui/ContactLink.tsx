import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { CONTACT_EMAIL } from '@qv/schema';

/** The contact address as a `mailto:` link (it is defined once, in @qv/schema). */
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

/** A notice's text with the contact address, if it has it, as a link. */
export function withContactLink(text: string): ReactNode {
  const parts = text.split(CONTACT_EMAIL);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? <ContactLink /> : null}
      {part}
    </Fragment>
  ));
}
