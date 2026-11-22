// Tests for handing React's caught errors to the page's reporter, without ever breaking the page.
import { Component, act, createElement } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ERROR_HANDLERS, reportError } from '../reportError';

type W = { __qvReportError?: (kind: string, message: string) => void };

afterEach(() => {
  delete (window as unknown as W).__qvReportError;
  vi.restoreAllMocks();
});

describe('reportError', () => {
  it('logs the error in the console, as React does when nobody asks for it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('se cayó');
    reportError(error);
    expect(log).toHaveBeenCalledWith(error);
  });

  it('sends a render error, and a file of the app that did not load as a chunk', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const report = vi.fn();
    (window as unknown as W).__qvReportError = report;
    reportError(new TypeError('x is undefined'));
    reportError(
      new TypeError('Failed to fetch dynamically imported module: /assets/StudyPage.ABC.js'),
    );
    reportError({ status: 404, statusText: 'Not Found' });
    expect(report.mock.calls).toEqual([
      ['render', 'x is undefined'],
      ['chunk', 'Failed to fetch dynamically imported module: /assets/StudyPage.ABC.js'],
      ['render', '404 Not Found'],
    ]);
  });

  it.each([
    ['an error without a message, by its name', Object.assign(new TypeError(''), {}), 'TypeError'],
    ['a response with a status only', { status: 503, statusText: undefined }, '503'],
    ['a response with a text only', { statusText: 'Gateway Timeout' }, 'Gateway Timeout'],
    ['anything else thrown, as text', 'cadena lanzada', 'cadena lanzada'],
    ['an object that is not a response, as text', { code: 7 }, '[object Object]'],
  ])('reads %s', (_, error, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const report = vi.fn();
    (window as unknown as W).__qvReportError = report;
    reportError(error);
    expect(report).toHaveBeenCalledWith('render', message);
  });

  it('without the reporter, or with one that throws, nothing breaks', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => reportError(new Error('a'))).not.toThrow();
    (window as unknown as W).__qvReportError = () => {
      throw new Error('roto');
    };
    expect(() => reportError(new Error('b'))).not.toThrow();
  });

  it('is what a React root hands the errors of a boundary and the ones nothing catches', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const report = vi.fn();
    (window as unknown as W).__qvReportError = report;
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      override state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      override render() {
        return this.state.failed ? 'cayó' : this.props.children;
      }
    }
    const Broken = (): never => {
      throw new Error('se rompió');
    };
    const container = document.createElement('div');
    await act(async () =>
      createRoot(container, ROOT_ERROR_HANDLERS).render(
        createElement(Boundary, null, createElement(Broken)),
      ),
    );
    expect(container.textContent).toBe('cayó');

    // `act` rethrows what nothing catches, which is what is being looked at: outside it, the root hands it over.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };
    const inAct = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const other = document.createElement('div');
      createRoot(other, ROOT_ERROR_HANDLERS).render(createElement(Broken));
      await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2));
      expect(other.textContent).toBe('');
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = inAct;
    }
    expect(report.mock.calls).toEqual([
      ['render', 'se rompió'],
      ['render', 'se rompió'],
    ]);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'se rompió' }));
  });
});
