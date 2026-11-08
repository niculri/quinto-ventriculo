import type { SVGProps } from 'react';

/**
 * The drawings behind the cards of a course's page: line art in the current color, a touch filled, so that
 * they work in the light and the dark theme. Decoration only (the card says what it is).
 */
function Art({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
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

/** An open book with its lines of text and a small double helix on the page. */
export function NotesArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <path
        d="M80 44c-12-10-32-14-58-13a4 4 0 0 0-4 4v86a4 4 0 0 0 4 4c26-1 46 3 58 13 12-10 32-14 58-13a4 4 0 0 0 4-4V35a4 4 0 0 0-4-4c-26-1-46 3-58 13Z"
        fill="currentColor"
        fillOpacity=".08"
      />
      <path d="M80 44v94" />
      <path d="M33 52c12 0 24 2 34 7M33 68c12 0 24 2 34 7M33 84c12 0 24 2 34 7M33 100c12 0 24 2 34 7" />
      <path d="M100 52c6 7 26 13 30 22s-24 15-30 24 24 15 30 22" strokeWidth="2.5" />
      <path d="M130 52c-6 7-26 13-30 22s24 15 30 24-24 15-30 22" strokeWidth="2.5" />
      <path d="M105 58h20M104 90h22M104 106h22" strokeWidth="2" />
    </Art>
  );
}

/** A test sheet: questions with their alternatives, one chosen, and a check. */
export function TestsArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <rect x="30" y="18" width="100" height="126" rx="10" fill="currentColor" fillOpacity=".08" />
      <path d="M62 18v-2a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v2a8 8 0 0 1-8 8H70a8 8 0 0 1-8-8Z" />
      <circle cx="50" cy="50" r="7" />
      <path d="M66 50h46" />
      <circle cx="50" cy="76" r="7" fill="currentColor" fillOpacity=".55" />
      <path d="m46 76 3 3 6-6" stroke="var(--color-surface, #fff)" strokeWidth="2.5" />
      <path d="M66 76h46" />
      <circle cx="50" cy="102" r="7" />
      <path d="M66 102h34" />
      <path d="M50 124h60" strokeWidth="2" strokeDasharray="1 7" />
    </Art>
  );
}

/** A stack of flashcards, the top one showing a question. */
export function AnkiArt(props: SVGProps<SVGSVGElement>) {
  return (
    <Art {...props}>
      <rect
        x="30"
        y="42"
        width="92"
        height="66"
        rx="9"
        transform="rotate(-14 76 75)"
        fill="currentColor"
        fillOpacity=".05"
      />
      <rect
        x="34"
        y="48"
        width="92"
        height="66"
        rx="9"
        transform="rotate(-5 80 81)"
        fill="currentColor"
        fillOpacity=".08"
      />
      <rect x="40" y="56" width="92" height="66" rx="9" fill="currentColor" fillOpacity=".12" />
      <path d="M78 80c0-6 5-10 11-10s10 4 10 9c0 7-10 8-10 15" />
      <path d="M89 106v.5" strokeWidth="4" />
      <path d="M20 132c14 10 34 12 50 6m0 0-8-7m8 7-9 6" strokeWidth="2.5" />
    </Art>
  );
}
