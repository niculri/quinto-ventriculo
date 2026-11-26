// Tests of the links given to the images: the first one stays while it opens long enough, then the newest goes.
import { describe, expect, it } from 'vitest';
import { RENEW_BEFORE_SEC } from '../signedMedia';
import { stableMedia } from '../stableMedia';

const NOW = 1_800_000_000;
const link = (key: string, e: number, s = `firma${String(e)}xxxxxxxxxxxxxxxxxxxxxxx`) =>
  `/api/media/notes/${key}.webp?e=${String(e)}&s=${s}`;
const html = (url: string) => `<img src="${url.replace(/&/g, '&amp;')}" alt="x">`;

describe('the links of the images', () => {
  it('a later answer with the same image gets the link given first, escaped as it came', () => {
    const links = stableMedia();
    const first = link('a', NOW + 7200);
    expect(links(html(first), NOW)).toBe(html(first));
    const later = link('a', NOW + 10_800);
    expect(links(html(later), NOW + 3600)).toBe(html(first));
    expect(links(JSON.stringify({ src: later }), NOW + 3600)).toBe(JSON.stringify({ src: first }));
  });

  it('a link close to its end is not handed out again: the newest takes its place', () => {
    const links = stableMedia();
    const first = link('a', NOW + 3600);
    links(html(first), NOW);
    const later = link('a', NOW + 7200);
    const close = NOW + 3600 - RENEW_BEFORE_SEC - 60;
    expect(links(html(later), close)).toBe(html(later));
    expect(links(html(link('a', NOW + 10_800)), close + 1)).toBe(html(later));
  });

  it('each image keeps its own, and other text, other URLs and the thumbnails’ links are left as they are', () => {
    const links = stableMedia();
    const a = link('a', NOW + 7200);
    const b = link('b', NOW + 7200);
    links(`${html(a)}${html(b)}`, NOW);
    const text = `${html(link('b', NOW + 9000))} <a href="/notes/x?e=1&s=2">x</a> ${html(link('a', NOW + 9000))}`;
    expect(links(text, NOW + 100)).toBe(`${html(b)} <a href="/notes/x?e=1&s=2">x</a> ${html(a)}`);
    const thumb = '/api/media/cards/thumb/c.webp?e=1800007200&p=cards%2Fthumb%2F&s=abc';
    links(thumb, NOW);
    const thumbLater = '/api/media/cards/thumb/c.webp?e=1800010800&p=cards%2Fthumb%2F&s=def';
    expect(links(thumbLater, NOW)).toBe(thumbLater);
    expect(links('/api/media/notes/a.webp?s=sin-vencimiento', NOW)).toBe(
      '/api/media/notes/a.webp?s=sin-vencimiento',
    );
  });

  it('keeps the links of the last images only', () => {
    const links = stableMedia(2);
    const first = link('a', NOW + 7200);
    links(html(first), NOW);
    links(html(link('b', NOW + 7200)), NOW);
    links(html(link('c', NOW + 7200)), NOW);
    const later = link('a', NOW + 9000);
    expect(links(html(later), NOW)).toBe(html(later));
  });
});
