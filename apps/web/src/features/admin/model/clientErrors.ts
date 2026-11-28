// «Errores» without React: the filters, how an error's system, browser, window and people read, and the text that
// copies an error (or a list of them) to paste into a chat with Claude, with «alumno A» instead of who.
import type { ClientErrorGroup, ClientErrorKind } from '@qv/schema';

import { clientErrorsStrings as s } from './strings/clientErrors.strings';

/** Who an account is: its email and, if Google gave it, its name. */
export interface AccountLabel {
  id: string;
  email: string;
  name: string | null;
}

export interface ErrorFilter {
  kind: ClientErrorKind | '';
  version: string;
  /** An account id, or '' for everybody. */
  account: string;
}

/** A deploy's name can never have parentheses: this one stands for «no version» (development) in a filter. */
export const NO_VERSION = '(dev)';
const versionKey = (v: string) => v || NO_VERSION;

export const filterErrors = (groups: readonly ClientErrorGroup[], f: ErrorFilter) =>
  groups.filter(
    (g) =>
      (!f.kind || g.kind === f.kind) &&
      (!f.version || versionKey(g.version) === f.version) &&
      (!f.account || g.accounts.includes(f.account)),
  );

/** The accounts in the list, in the order they first show up. */
export const accountsOf = (groups: readonly ClientErrorGroup[]) => [
  ...new Set(groups.flatMap((g) => g.accounts)),
];

/** «Ana Pérez (ana.perez@…)», the email alone, or the start of the id while it is not known (a deleted account). */
export function personName(id: string, labels: readonly AccountLabel[]): string {
  const label = labels.find((l) => l.id === id);
  if (!label) return s.unknownAccount(id.slice(0, 8));
  return label.name ? `${label.name} (${label.email})` : label.email;
}

/** «alumno A», «alumno B»… by the order the accounts show up in what is copied: the same person, the same letter. */
export function aliasesOf(groups: readonly ClientErrorGroup[]): Map<string, string> {
  const letter = (i: number): string =>
    i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26);
  return new Map(accountsOf(groups).map((id, i) => [id, s.alias(letter(i))]));
}

/** «2 personas (alumno A, alumno B) y 1 vez sin sesión». */
function peopleLine(g: ClientErrorGroup, aliases: Map<string, string>): string {
  const names = g.accounts.map((id) => aliases.get(id)!);
  const more = g.people - names.length;
  return s.claude.people(
    s.people(g.people),
    [...names, ...(more > 0 ? [s.more(more)] : [])].join(', '),
    g.anonymous ? s.times(g.anonymous) : '',
  );
}

/** The deploys in the list, newest first (as the list comes, by its last error). */
export const versionsOf = (groups: readonly ClientErrorGroup[]) => [
  ...new Set(groups.map((g) => versionKey(g.version))),
];

/** «iOS 18 · Safari 18», «—» for an older point. */
export const environment = (os: string, browser: string) =>
  [os, browser].filter(Boolean).join(' · ') || s.none;

/** The other systems and browsers it showed in, besides the last one. */
export function otherEnvironments(g: ClientErrorGroup): string {
  return [
    ...g.systems.filter((x) => x !== g.os),
    ...g.browsers.filter((x) => x !== g.browser),
  ].join(', ');
}

export const windowText = (g: ClientErrorGroup) =>
  g.viewport ? s.window(g.viewport, g.phone) : s.none;

const WHEN = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const when = (iso: string) => WHEN.format(new Date(iso));

/** Everything that helps to find the cause, without who; the stack between fences so that it pastes as it is. */
export function claudeText(
  g: ClientErrorGroup,
  days: number,
  aliases: Map<string, string> = aliasesOf([g]),
): string {
  const c = s.claude;
  return [
    c.title,
    c.what(s.kinds[g.kind], g.kind),
    c.message(g.message || s.none),
    c.page(g.page),
    g.version ? c.version(g.version) : c.noVersion,
    c.environment(environment(g.os, g.browser), otherEnvironments(g)),
    c.window(windowText(g)),
    c.times(s.times(g.count), days),
    peopleLine(g, aliases),
    c.seen(when(g.firstSeen), when(g.lastSeen)),
    ...(g.stack ? [c.stack, '```', g.stack, '```'] : [c.noStack]),
    '',
    c.ask,
  ].join('\n');
}

export function claudeTextAll(groups: readonly ClientErrorGroup[], days: number): string {
  const aliases = aliasesOf(groups);
  return groups.map((g) => claudeText(g, days, aliases)).join(s.claude.separator);
}
