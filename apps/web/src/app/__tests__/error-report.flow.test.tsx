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

  it('reports an error of the app with where it came from, without the origin', () => {
    load();
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'x is undefined',
        filename: `${location.origin}/assets/index.CXEF97yv.js`,
        lineno: 12,
      }),
    );
    expect(sent.map((s) => [s.kind, s.message])).toEqual([
      ['unhandled', 'x is undefined (/assets/index.CXEF97yv.js:12)'],
    ]);
  });

  it('does not report what is not the site: files of someone else, pictures, extensions, the browser itself', () => {
    load();
    const blocked = document.createElement('script');
    blocked.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    document.body.append(blocked);
    blocked.dispatchEvent(new Event('error'));
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = 'https://fonts.example.test/inter.css';
    document.head.append(sheet);
    sheet.dispatchEvent(new Event('error'));
    const picture = document.createElement('img');
    picture.src = `${location.origin}/api/media/figura.png`;
    document.body.append(picture);
    picture.dispatchEvent(new Event('error'));
    for (const init of [
      { message: 'x is not defined', filename: 'chrome-extension://abc/content.js', lineno: 3 },
      { message: 'Script error.', filename: '', lineno: 0 },
      { message: 'ResizeObserver loop completed with undelivered notifications.' },
    ]) {
      window.dispatchEvent(new ErrorEvent('error', init));
    }
    expect(sent).toEqual([]);
  });

  it('reports a page of the app that could not be imported, which no element reports', () => {
    vi.useFakeTimers();
    load();
    const failure = Object.assign(new Event('vite:preloadError', { cancelable: true }), {
      payload: new TypeError(
        `Failed to fetch dynamically imported module: ${location.origin}/assets/PrivacyPage.OLD123.js`,
      ),
    });
    window.dispatchEvent(failure);
    expect(failure.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(sent.map((s) => [s.kind, s.message])).toEqual([
      ['chunk', 'Failed to fetch dynamically imported module: /assets/PrivacyPage.OLD123.js'],
    ]);
  });

  it('a failed import without a message is reported all the same', () => {
    vi.useFakeTimers();
    load();
    window.dispatchEvent(new Event('vite:preloadError'));
    vi.advanceTimersByTime(1000);
    expect(sent.map((s) => [s.kind, s.message])).toEqual([['chunk', 'No cargó un archivo']]);
  });

  describe('a file of the app that did not load, and the import that fails with it', () => {
    const failedLink = () => {
      const script = document.createElement('script');
      script.src = `${location.origin}/assets/PrivacyPage.OLD123.js`;
      document.body.append(script);
      script.dispatchEvent(new Event('error'));
    };
    const failedImport = () =>
      window.dispatchEvent(
        Object.assign(new Event('vite:preloadError'), {
          payload: new TypeError('Importing failed'),
        }),
      );

    it('are one report when the <link> fails first, as in Chromium', () => {
      vi.useFakeTimers();
      load();
      failedLink();
      failedImport();
      vi.advanceTimersByTime(1000);
      expect(sent.map((s) => s.message)).toEqual(['No cargó /assets/PrivacyPage.OLD123.js']);
    });

    it('and one when the import fails first, as in WebKit', () => {
      vi.useFakeTimers();
      load();
      failedImport();
      vi.advanceTimersByTime(500);
      failedLink();
      vi.advanceTimersByTime(500);
      expect(sent.map((s) => s.message)).toEqual(['No cargó /assets/PrivacyPage.OLD123.js']);
    });
  });

  it('reports a page left blank 8 seconds after it loaded, and not one that mounted', () => {
    vi.useFakeTimers();
    load();
    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(7999);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
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
