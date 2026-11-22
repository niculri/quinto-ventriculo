// The initials that stand for a person: from their name, or else from their email.
import { blankToNull } from './blankToNull';
export function initials(name: string | null, email: string): string {
  const base = blankToNull(name?.trim()) ?? blankToNull(email.split('@')[0]) ?? '?';
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)!.charAt(0) : '')
  ).toUpperCase();
  return blankToNull(letters) ?? '?';
}
