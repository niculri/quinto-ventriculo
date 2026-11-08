import { LoaderCircle } from 'lucide-react';

export function Loading({
  text = 'Cargando…',
  fullScreen = false,
}: {
  text?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 text-sm text-muted ${fullScreen ? 'min-h-dvh' : 'py-16'}`}
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {text}
    </div>
  );
}

/** Gray rectangles while loading, shaped like the content. */
export function Skeleton({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-2 ${className}`} />
  );
}
