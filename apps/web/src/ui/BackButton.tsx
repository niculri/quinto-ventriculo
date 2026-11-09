import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { button } from './styles';

/**
 * The «back» of the screens where one answers (studying a deck, a final review, a test): a ghost button with
 * an arrow and where it goes back to («Biología celular · Certamen 2»), cut with «…» if it does not fit; on a
 * phone, only the arrow. Either a link (`to`) or an action (`onClick`: the test goes back to its cover, which
 * has the same URL).
 */
export function BackButton({
  label,
  to,
  onClick,
  className = '',
}: {
  label: string;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const props = {
    className: `${button.base} ${button.ghost} min-w-0 max-w-full ${className}`.trim(),
    'aria-label': `Volver a ${label}`,
    title: label,
  };
  const content = (
    <>
      <ArrowLeft className="size-4 flex-none" aria-hidden="true" />
      <span className="hidden max-w-[20rem] truncate sm:inline">{label}</span>
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} {...props}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} {...props}>
      {content}
    </button>
  );
}

/** «Biología celular · Certamen 2», or only the course when it is not in an assessment. */
export function backLabel(course: string, assessment: string | null | undefined): string {
  return assessment ? `${course} · ${assessment}` : course;
}
