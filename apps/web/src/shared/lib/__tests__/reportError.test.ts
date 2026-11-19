// Tests for handing React's caught errors to the page's reporter, without ever breaking the page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '../reportError';

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

  it('without the reporter, or with one that throws, nothing breaks', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => reportError(new Error('a'))).not.toThrow();
    (window as unknown as W).__qvReportError = () => {
      throw new Error('roto');
    };
    expect(() => reportError(new Error('b'))).not.toThrow();
  });
});
