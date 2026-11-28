// «Errores» without React: the filters, how an error's system, browser and window read, and the text that copies an
// error (or a list of them) to paste into a chat with Claude.
import type { ClientErrorGroup, ClientErrorKind } from '@qv/schema';
import { clientErrorsStrings as s } from './strings/clientErrors.strings';

export interface ErrorFilter {
  kind: ClientErrorKind | '';
  version: string;
}

/** A deploy's name can never have parentheses: this one stands for «no version» (development) in a filter. */
export const NO_VERSION = '(dev)';
const versionKey = (v: string) => v || NO_VERSION;

export const filterErrors = (groups: readonly ClientErrorGroup[], f: ErrorFilter) =>
  groups.filter(
    (g) => (!f.kind || g.kind === f.kind) && (!f.version || versionKey(g.version) === f.version),
  );

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
export function claudeText(g: ClientErrorGroup, days: number): string {
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
    c.seen(when(g.firstSeen), when(g.lastSeen)),
    ...(g.stack ? [c.stack, '```', g.stack, '```'] : [c.noStack]),
    '',
    c.ask,
  ].join('\n');
}

export const claudeTextAll = (groups: readonly ClientErrorGroup[], days: number) =>
  groups.map((g) => claudeText(g, days)).join(s.claude.separator);
