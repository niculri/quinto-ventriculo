// The drawings behind the cards of a course's page, one per section and the same for every course: thick lines in the
// current color, larger than the card's corner and cut by it, so that they read as a background and never as content.
import type { SVGProps } from 'react';

function Art({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Apuntes: a page with its corner folded, lines of text and one of them marked. */
export function NotesArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <path
        d="M38 14h62l30 30v100a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8Z"
        fill="currentColor"
        fillOpacity=".1"
      />
      <path d="M100 14v22a8 8 0 0 0 8 8h22" />
      <path d="M50 66h60M50 88h60M50 132h36" />
      <path d="M48 110h66" strokeWidth="14" strokeOpacity=".35" />
    </Art>
  );
}

/** Anki: two cards, one just behind the other: the front one is opaque, so no line of the back one crosses it. */
export function AnkiArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <rect
        x="36"
        y="26"
        width="104"
        height="70"
        rx="10"
        transform="rotate(6 88 61)"
        fill="currentColor"
        fillOpacity=".06"
      />
      <rect x="20" y="52" width="104" height="70" rx="10" fill="var(--surface)" stroke="none" />
      <rect x="20" y="52" width="104" height="70" rx="10" fill="currentColor" fillOpacity=".12" />
      <path d="M42 80h56M42 100h34" />
    </Art>
  );
}

/** Tests: a sheet of alternatives, one of them marked. */
export function TestsArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <rect x="28" y="16" width="104" height="136" rx="12" fill="currentColor" fillOpacity=".1" />
      <circle cx="54" cy="52" r="9" />
      <path d="M76 52h34" />
      <circle cx="54" cy="84" r="9" fill="currentColor" fillOpacity=".45" />
      <path d="M76 84h34" />
      <circle cx="54" cy="116" r="9" />
      <path d="M76 116h22" />
    </Art>
  );
}

/** Gymkana: a long bone across the corner, with a pin on its right end. */
export function GymkanaArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <path
        d="M53.1 72h53.8a14 14 0 1 1 18.3 8 14 14 0 1 1-18.3 8H53.1a14 14 0 1 1-18.3-8 14 14 0 1 1 18.3-8Z"
        transform="translate(-8 22) rotate(-30 80 80)"
        fill="currentColor"
        fillOpacity=".1"
      />
      <path d="M101 75 77 29" />
      <circle cx="72" cy="19" r="11" fill="currentColor" fillOpacity=".45" />
    </Art>
  );
}
