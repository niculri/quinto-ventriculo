// Error and info notices, and the error of a failed load with its «Reintentar» button.
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiRequestError } from '../lib/api';
import { withContactLink } from './ContactLink';
import { button } from './styles';
import { sharedStrings } from '../strings';

export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  return sharedStrings.errors.unexpected;
}

export function Notice({
  title,
  children,
  tone = 'error',
}: {
  title: string;
  children?: ReactNode;
  tone?: 'error' | 'info';
}) {
  const colors =
    tone === 'error'
      ? 'border-[#c2410c]/30 bg-[#c2410c]/6 text-ink'
      : 'border-brand/25 bg-brand-soft text-ink';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl border p-4 ${colors}`}
    >
      <CircleAlert
        className={`mt-0.5 size-5 flex-none ${tone === 'error' ? 'text-[#c2410c]' : 'text-brand'}`}
        aria-hidden="true"
      />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

export function ErrorWithRetry({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Notice title={sharedStrings.loadError.title}>
        <p>{withContactLink(errorMessage(error))}</p>
        <button
          type="button"
          onClick={onRetry}
          className={`${button.base} ${button.secondary} mt-3`}
        >
          {sharedStrings.loadError.retry}
        </button>
      </Notice>
    </div>
  );
}
