// Tests public/error-report.js, the classic script that reports a page that failed before or outside the app: a file
// that did not load, an error nothing caught and a page left blank. It runs the real file in this window.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(
  resolve(import.meta.dirname, '../../../public/error-report.js'),
  'utf8',
);

type Sent = { kind: string; page: string; message: string; version: string };
let sent: Sent[];
let listeners: [
  string,
  EventListenerOrEventListenerObject,
  boolean | AddEventListenerOptions | undefined,
][];

function load() {
  // The script adds its listeners to window: they are taken off after each test.
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, options) => {
    listeners.push([type, fn, options]);
    add(type, fn, options);
  });
  new Function(SOURCE)();
}

beforeEach(() => {
  sent = [];
  listeners = [];
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_url: string, body: string) => {
      sent.push(JSON.parse(body) as Sent);
      return true;
    },
  });
  document.body.innerHTML = '<div id="root"></div>';
  document.head.innerHTML = '<script type="module" src="/assets/index.CXEF97yv.js"></script>';
  window.history.replaceState(null, '', '/semesters/2?q=secreto#parte');
});

afterEach(() => {
  for (const [type, fn, options] of listeners) window.removeEventListener(type, fn, options);
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as unknown as { __qvReportError?: unknown }).__qvReportError;
});

describe('public/error-report.js', () => {
  it('reports a script that did not load, with the path alone and the version of the page', () => {
    load();
    const script = document.createElement('script');
    script.src = `${location.origin}/assets/StudyPage.OLD123.js`;
    document.body.append(script);
    script.dispatchEvent(new Event('error'));
    expect(sent).toEqual([
      {
        kind: 'chunk',
        page: '/semesters/2',
        message: 'No cargó /assets/StudyPage.OLD123.js',
        version: 'CXEF97yv',
      },
    ]);
  });

  it('reports an error nothing caught and a rejected promise, without emails nor tokens', () => {
    load();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'falló para ana@ug.uchile.cl', filename: '', lineno: 0 }),
    );
    const reason = new Error('token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 vencido');
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown };
    rejection.reason = reason;
    window.dispatchEvent(rejection);
    expect(sent.map((s) => [s.kind, s.message])).toEqual([
      ['unhandled', 'falló para (correo)'],
      ['unhandled', 'token … vencido'],
    ]);
  });

  it('reports a page left blank 8 seconds after it loaded, and not one that mounted', () => {
    vi.useFakeTimers();
    load();
    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(8000);
    expect(sent.map((s) => s.kind)).toEqual(['boot']);

    sent = [];
    document.getElementById('root')!.append(document.createElement('main'));
    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(8000);
    expect(sent).toEqual([]);
  });

  it('sends the same error once and at most 5 a page', () => {
    load();
    const report = (window as unknown as { __qvReportError: (k: string, m: string) => void })
      .__qvReportError;
    report('render', 'uno');
    report('render', 'uno');
    for (const m of ['dos', 'tres', 'cuatro', 'cinco', 'seis']) report('render', m);
    expect(sent.map((s) => s.message)).toEqual(['uno', 'dos', 'tres', 'cuatro', 'cinco']);
  });

  it('without sendBeacon it uses fetch, and an error in either never escapes', () => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined });
    const fetch = vi.spyOn(window, 'fetch').mockRejectedValue(new Error('sin red'));
    load();
    const report = (window as unknown as { __qvReportError: (k: string, m: string) => void })
      .__qvReportError;
    expect(() => report('render', 'uno')).not.toThrow();
    expect(fetch).toHaveBeenCalledWith(
      '/api/client-error',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });
});
