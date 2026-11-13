/**
 * Sagittal section of the brain (cerebrum, corpus callosum, brainstem and cerebellum) with the «fifth
 * ventricle» (cavum septi pellucidi) in the accent color, between the corpus callosum and the fornix. Same
 * drawing as public/icon.svg; the background follows the theme.
 */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-[#0f3d4c] dark:fill-[#1d5566]" />
      <g transform="translate(32 33) scale(1.08) translate(-32 -33)">
        {/* Cerebellum, with its folia. */}
        <path
          d="M39.5 41 C43.5 36.5 53 37.5 55.5 42.5 C57.2 46.8 54 51.3 48.5 51.6 C43.2 51.9 39 47.8 39.5 41 Z"
          fill="#c9dde0"
        />
        <g fill="none" stroke="#0f3d4c" strokeOpacity=".5" strokeWidth=".9" strokeLinecap="round">
          <path d="M42 44.5 C46 43.5 50 43.6 54.5 44.6" />
          <path d="M42.6 47.6 C46 46.8 49.5 47.4 52.8 49" />
          <path d="M43 41.4 C46 40.3 49.5 40.4 52.5 41.3" />
        </g>
        {/* Brainstem. */}
        <path
          d="M27.5 37.5 C30.5 43.5 34 50 37 56.8 L43.2 56.8 C41.6 52.5 40.6 48 40.8 43.5 C40.9 41 40.2 39.3 38.8 38 Z"
          fill="#c9dde0"
          stroke="#0f3d4c"
          strokeOpacity=".35"
          strokeWidth=".7"
        />
        {/* Cerebrum, with its sulci. */}
        <path
          d="M9 33 C8 21 19 10.5 33 10.5 C47 10.5 56.5 20 56.5 31.5 C56.5 36.5 54.5 39.5 50.5 40.5 C46 41.5 41 39 36 38.5 C31 38 27 39 22 40.5 C14 42 9.5 38.5 9 33 Z"
          fill="#e8f1f2"
        />
        <g fill="none" stroke="#0f3d4c" strokeOpacity=".3" strokeWidth="1.1" strokeLinecap="round">
          <path d="M14.5 33 C13.5 21.5 22.5 16.5 32.5 16.5 C40 16.5 45 18.5 47.5 21" />
          <path d="M44 12 C44.5 16 46 19 47.5 21 C49 24 50.5 26 51 29" />
          <path d="M55.8 33 C51.5 33.5 47.5 35 43.5 34.8" />
          <path d="M51 29 L55.8 33" />
          <path d="M22 11.8 C22 14 22.5 15.5 23.5 17" />
          <path d="M32 10.6 C32.5 12.5 33 14.5 34 16.5" />
          <path d="M11 27 C13 26.5 14 26.5 14.8 27" />
        </g>
        {/* Corpus callosum and fornix. */}
        <path
          d="M20.5 33 C18.5 26 25 22.5 32 22.5 C39 22.5 44.5 24.5 44.5 30"
          fill="none"
          stroke="#3f8798"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <path
          d="M43.5 31.5 C38 29.5 31 29.5 27.5 34"
          fill="none"
          stroke="#3f8798"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* The fifth ventricle. */}
        <ellipse cx="30.5" cy="27.4" rx="5.2" ry="2" fill="#f2a65a" />
      </g>
    </svg>
  );
}

/**
 * The icon and the name; with `tagline`, the subtitle under the name (on wide screens). `preview`: the mark of the
 * draft's preview (features/preview), in the same places, so that nothing moves when it comes or goes: «Vista previa
 * del borrador» in the subtitle's cell (the subtitle stays there, invisible, and keeps its width) and a dot on the
 * icon (positioned over it: on the phone there is no subtitle).
 */
export function Logo({
  compact = false,
  tagline = false,
  preview = false,
}: {
  compact?: boolean;
  tagline?: boolean;
  preview?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex-none">
        <LogoMark />
        {preview ? (
          <span
            aria-hidden="true"
            data-preview-mark=""
            className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-accent ring-2 ring-chrome"
          />
        ) : null}
      </span>
      <span className={compact ? 'max-sm:sr-only' : ''}>
        <span className="block font-serif text-[1.05rem] leading-none font-semibold tracking-tight text-ink">
          El Quinto Ventrículo
        </span>
        {tagline ? (
          // Drawn by CSS: the link already says where it goes, and the motto is not read on every page.
          <span className="mt-1 hidden lg:grid" aria-hidden="true">
            <span
              data-text="El ventrículo que no aparece en el Netter."
              className={`col-start-1 row-start-1 font-serif text-[0.78rem] leading-none text-muted italic before:content-[attr(data-text)] ${
                preview ? 'invisible' : ''
              }`}
            />
            {preview ? (
              <span
                data-text="Vista previa del borrador"
                className="col-start-1 row-start-1 text-[0.72rem] leading-none font-semibold text-accent before:content-[attr(data-text)]"
              />
            ) : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}
