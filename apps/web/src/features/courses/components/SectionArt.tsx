// The drawings behind the cards of a course's page, one per section and the same for every course: thick lines in the
// current color, cut by the card's corner, so that they read as a background and never as content.
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

/** Anki: two cards, one behind the other. */
export function AnkiArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <rect
        x="40"
        y="22"
        width="96"
        height="70"
        rx="10"
        transform="rotate(10 88 57)"
        fill="currentColor"
        fillOpacity=".06"
      />
      <rect x="22" y="58" width="96" height="70" rx="10" fill="currentColor" fillOpacity=".12" />
      <path d="M46 84h48M46 104h30" />
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

/** Gymkana: a pin over a figure, as in the gymkana's photos. */
export function GymkanaArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <path d="M30 146c4-40 22-70 50-70s46 30 50 70" fill="currentColor" fillOpacity=".1" />
      <path d="M80 104 108 40" />
      <circle cx="112" cy="30" r="13" fill="currentColor" fillOpacity=".45" />
    </Art>
  );
}
