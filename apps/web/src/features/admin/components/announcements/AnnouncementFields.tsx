// The fields of an announcement: its kind (new or changed material, when it goes with a publication), title and text,
// with what is left of each and the phrases that only make sense to whoever made the material.
import { useId } from 'react';
import { announcementPhrases } from '@qv/release-review';
import { NEWS_BODY_MAX, NEWS_TITLE_MAX } from '@qv/schema';
import type { AnnouncementDraft } from '@qv/schema';
import { Reserved } from '../../../../shared/ui/Reserved';
import { Select } from '../../../../shared/ui/Select';
import { announcementFieldsStrings as s } from './strings/AnnouncementFields.strings';

const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60';

export function AnnouncementFields({
  draft,
  onChange,
  disabled = false,
  withKind = false,
}: {
  draft: AnnouncementDraft;
  onChange: (draft: AnnouncementDraft) => void;
  disabled?: boolean;
  /** Inside the popup that publishes: new or changed material. */
  withKind?: boolean;
}) {
  const id = useId();
  const phrases = announcementPhrases(draft);
  return (
    <div className="space-y-3">
      {withKind ? (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">{s.kind}</span>
          <Select
            label={s.kind}
            value={draft.kind}
            modal
            disabled={disabled}
            options={(['new', 'update'] as const).map((k) => ({ value: k, label: s.kinds[k] }))}
            onChange={(kind) => onChange({ ...draft, kind })}
            className="w-56 max-w-full"
          />
        </div>
      ) : null}
      <div>
        <label htmlFor={`${id}-title`} className="mb-1 block text-xs font-medium text-muted">
          {s.title}
        </label>
        <input
          id={`${id}-title`}
          className={field}
          value={draft.title}
          maxLength={NEWS_TITLE_MAX}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted">{s.left(NEWS_TITLE_MAX - draft.title.length)}</p>
      </div>
      <div>
        <label htmlFor={`${id}-body`} className="mb-1 block text-xs font-medium text-muted">
          {s.body}
        </label>
        <textarea
          id={`${id}-body`}
          className={`${field} h-28 resize-none`}
          value={draft.body}
          maxLength={NEWS_BODY_MAX}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted">
          {s.bodyHelp} {s.left(NEWS_BODY_MAX - draft.body.length)}
        </p>
      </div>
      <Reserved longest={s.noPhrases} className="text-xs">
        <p className={phrases.length ? 'text-ink' : 'text-muted'}>
          {phrases.length
            ? phrases.map((p) => s.phrase(p.label, p.snippet)).join(' ')
            : s.noPhrases}
        </p>
      </Reserved>
    </div>
  );
}
