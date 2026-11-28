// Made-up errors of the demo's browsers for the panel's «Errores»: several kinds, pages, deploys, systems, browsers and
// accounts (the demo's and two of the demo's «Acceso») over the last 30 days.
import type { ClientErrorPoint } from '../ports/clientErrors';

const HOUR = 3_600_000;

const IPHONE = { os: 'iOS 18', browser: 'Safari 18', phone: true, viewport: '390x844' };
const ANDROID = { os: 'Android 14', browser: 'Chrome 131', phone: true, viewport: '412x915' };
const MAC = { os: 'macOS', browser: 'Chrome 131', phone: false, viewport: '1440x900' };
const WINDOWS = { os: 'Windows', browser: 'Edge 131', phone: false, viewport: '1920x1080' };
const OLD = { os: '', browser: '', phone: null, viewport: '' };

const STACK = [
  'TypeError: Cannot read properties of undefined (reading "cards")',
  '    at deckRows (/assets/DeckPage-C1x9Qa2b.js:1:4821)',
  '    at renderWithHooks (/assets/index-D4f7Kp1z.js:8:19233)',
  '    at beginWork (/assets/index-D4f7Kp1z.js:8:43012)',
].join('\n');

const DEMO = '00000000-0000-4000-8000-0000000000de';
const ANA = '00000000-0000-4000-8000-0000000000a1';
const LUIS = '00000000-0000-4000-8000-0000000000a2';

type Seed = [
  hoursAgo: number,
  env: typeof IPHONE | typeof OLD,
  error: Omit<ClientErrorPoint, keyof typeof OLD | 'account'>,
  account: string | null,
];

const RENDER = {
  kind: 'render',
  page: '/semesters/1/courses/anatomia-1/anki/certamen-1',
  message: 'Cannot read properties of undefined (reading "cards")',
  version: 'D4f7Kp1z',
  stack: STACK,
} as const;
const CHUNK = {
  kind: 'chunk',
  page: '/semesters/2/courses/biologia-celular/notes/11-traduccion',
  message: 'No cargó /assets/NotePage-B8u2Lm0c.js',
  version: 'A9c3Hh7q',
  stack: '',
} as const;
const UNHANDLED = {
  kind: 'unhandled',
  page: '/home',
  message: 'Failed to fetch',
  version: 'D4f7Kp1z',
  stack: 'TypeError: Failed to fetch\n    at request (/assets/index-D4f7Kp1z.js:3:1120)',
} as const;
const BOOT = {
  kind: 'boot',
  page: '/',
  message: 'La página quedó en blanco',
  version: 'A9c3Hh7q',
  stack: '',
} as const;

const SEEDS: Seed[] = [
  [1, IPHONE, RENDER, DEMO],
  [5, IPHONE, RENDER, DEMO],
  [26, ANDROID, RENDER, ANA],
  [3, MAC, UNHANDLED, LUIS],
  [50, WINDOWS, UNHANDLED, null],
  [200, ANDROID, CHUNK, ANA],
  [210, IPHONE, CHUNK, null],
  [400, OLD, BOOT, null],
  [600, MAC, BOOT, null],
];

export function demoClientErrors(now: number): (ClientErrorPoint & { at: number })[] {
  return SEEDS.map(([hours, env, error, account]) => ({
    ...error,
    ...env,
    account,
    at: now - hours * HOUR,
  }));
}
