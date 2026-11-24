// Tests which images of a card are asked for ahead: the back's while the front is up, both sides of the next cards,
// none of them with the data saver.
import { describe, expect, it } from 'vitest';
import { backImagesOf, upcomingImagesOf } from '../imagePreload';

const signed = (key: string) => `/api/media/cards/${key}.webp?e=7200&s=sig${key}`;
const img = (key: string) => `<img src="${signed(key).replace('&', '&amp;')}" alt="">`;

describe('the images of a side', () => {
  it('gives each signed image once, with the query the browser will ask for', () => {
    const html = `<p>Una</p>${img('a')}<div>${img('b')}</div>${img('a')}`;
    expect(backImagesOf({ front: '', back: html })).toEqual([signed('a'), signed('b')]);
    expect(upcomingImagesOf({ front: html, back: html }, false)).toEqual([
      signed('a'),
      signed('b'),
    ]);
  });

  it('leaves out what is not a private image of the site', () => {
    const html = `<img src="data:image/png;base64,AAAA"><img data-src="/api/media/x.webp"><img data-media-invalid=""><a href="/api/media/y">y</a>`;
    expect(backImagesOf({ front: '', back: html })).toEqual([]);
  });
});

describe('backImagesOf', () => {
  it('gives the back’s images the front is not already loading', () => {
    expect(backImagesOf({ front: img('occluded'), back: img('occluded') + img('answer') })).toEqual(
      [signed('answer')],
    );
  });

  it('gives nothing for a back without images', () => {
    expect(backImagesOf({ front: img('a'), back: '<b>7</b>' })).toEqual([]);
  });
});

describe('upcomingImagesOf', () => {
  const card = { front: img('front'), back: img('front') + img('back') };

  it('gives both sides of a card further down the queue, each image once', () => {
    expect(upcomingImagesOf(card, false)).toEqual([signed('front'), signed('back')]);
  });

  it('gives nothing when the browser saves data', () => {
    expect(upcomingImagesOf(card, true)).toEqual([]);
  });
});
