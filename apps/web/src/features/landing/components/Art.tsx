// The landing page's drawings: Google's logo on the sign-in button and the large faint section of the site's logo.

export function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px] rounded-full bg-white p-px" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/** The logo's sagittal section, large and faint, with the fifth ventricle in the accent color. */
export function Illustration() {
  return (
    <svg
      viewBox="4 4 58 58"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 -right-40 hidden w-[36rem] -translate-y-1/2 opacity-70 md:block lg:right-0 xl:right-8 dark:opacity-55"
    >
      <defs>
        <radialGradient id="landing-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--brand-soft)" />
          <stop offset="100%" stopColor="var(--bg)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="33" cy="33" r="29" fill="url(#landing-glow)" />
      <g stroke="var(--brand)" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M9 33 C8 21 19 10.5 33 10.5 C47 10.5 56.5 20 56.5 31.5 C56.5 36.5 54.5 39.5 50.5 40.5 C46 41.5 41 39 36 38.5 C31 38 27 39 22 40.5 C14 42 9.5 38.5 9 33 Z"
          fill="var(--brand)"
          fillOpacity="0.05"
          strokeOpacity="0.3"
          strokeWidth="0.16"
        />
        <path
          d="M27.5 37.5 C30.5 43.5 34 50 37 56.8 L43.2 56.8 C41.6 52.5 40.6 48 40.8 43.5 C40.9 41 40.2 39.3 38.8 38 Z"
          fill="var(--brand)"
          fillOpacity="0.04"
          strokeOpacity="0.24"
          strokeWidth="0.14"
        />
        <path
          d="M39.5 41 C43.5 36.5 53 37.5 55.5 42.5 C57.2 46.8 54 51.3 48.5 51.6 C43.2 51.9 39 47.8 39.5 41 Z"
          fill="var(--brand)"
          fillOpacity="0.05"
          strokeOpacity="0.26"
          strokeWidth="0.14"
        />
        <g fill="none" strokeOpacity="0.2" strokeWidth="0.13">
          <path d="M14.5 33 C13.5 21.5 22.5 16.5 32.5 16.5 C40 16.5 45 18.5 47.5 21" />
          <path d="M44 12 C44.5 16 46 19 47.5 21 C49 24 50.5 26 51 29" />
          <path d="M55.8 33 C51.5 33.5 47.5 35 43.5 34.8" />
          <path d="M51 29 L55.8 33" />
          <path d="M22 11.8 C22 14 22.5 15.5 23.5 17" />
          <path d="M32 10.6 C32.5 12.5 33 14.5 34 16.5" />
          <path d="M11 27 C13 26.5 14 26.5 14.8 27" />
          <path d="M42 44.5 C46 43.5 50 43.6 54.5 44.6" />
          <path d="M42.6 47.6 C46 46.8 49.5 47.4 52.8 49" />
          <path d="M43 41.4 C46 40.3 49.5 40.4 52.5 41.3" />
        </g>
        <path
          d="M20.5 33 C18.5 26 25 22.5 32 22.5 C39 22.5 44.5 24.5 44.5 30"
          fill="none"
          strokeOpacity="0.16"
          strokeWidth="2.6"
        />
        <path
          d="M43.5 31.5 C38 29.5 31 29.5 27.5 34"
          fill="none"
          strokeOpacity="0.16"
          strokeWidth="1.1"
        />
      </g>
      <ellipse cx="30.5" cy="27.4" rx="5.2" ry="2" fill="var(--accent)" fillOpacity="0.7" />
    </svg>
  );
}
