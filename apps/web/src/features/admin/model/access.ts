// «Acceso» without React: the invited grouped by list, what each list lets remove, and the form's list names.
import type { AccessInvite, AccessReport } from '@qv/schema/user';

export type Removing =
  { kind: 'person'; email: string } | { kind: 'list'; list: string; count: number };

export type Appointing = { email: string; admin: boolean };

export function invitesByList(invited: readonly AccessInvite[]): [string, AccessInvite[]][] {
  const m = new Map<string, AccessInvite[]>();
  for (const i of invited) m.set(i.list, [...(m.get(i.list) ?? []), i]);
  return [...m.entries()];
}

/** «Sacar la lista» never takes out an administrator, so a list with only administrators has no button. */
export const removableCount = (people: readonly AccessInvite[]) =>
  people.filter((p) => !p.admin).length;

export const listCounts = (report: AccessReport, list: string) =>
  report.lists.find((l) => l.list === list);

/** The option of «Lista» that means a new one; the others are `list:<name>`. */
export const NEW_LIST = '__new__';

/**
 * The list chosen is always an option: the one just invited into until the report brings it, and one removed while
 * chosen (the Select would show nothing, and the next invitation would still go to that name).
 */
export function listChoice(lists: readonly string[], choice: string) {
  const chosen = choice === NEW_LIST ? null : choice.slice('list:'.length);
  return { chosen, names: [...new Set([...lists, ...(chosen ? [chosen] : [])])].sort() };
}

export const removalKey = (t: Removing) => (t.kind === 'person' ? `p:${t.email}` : `l:${t.list}`);

export const appointingKey = (t: Appointing) => `${t.admin ? 'a' : 'r'}:${t.email}`;
