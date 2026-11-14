// The initials that stand for a person: from their name, or else from their email.
export function initials(name: string | null, email: string): string {
  const base = name?.trim() || email.split('@')[0] || '?';
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}
