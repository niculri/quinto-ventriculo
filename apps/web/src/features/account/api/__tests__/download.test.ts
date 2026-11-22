// Tests saveFile: the file is downloaded with its name by a link that does not stay in the page, and its address is
// freed only after the browser had time to start the download.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from '../download';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveFile', () => {
  it('clicks a link with the name, removes it, and revokes the address 10 s later', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: () => 'blob:archivo', revokeObjectURL: revoke });
    const clicked: { href: string; download: string; inPage: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({
        href: this.href,
        download: this.download,
        inPage: document.body.contains(this),
      });
    });
    saveFile(new Blob(['x']), 'datos.json');
    expect(clicked).toEqual([{ href: 'blob:archivo', download: 'datos.json', inPage: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(9_999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:archivo');
  });
});
