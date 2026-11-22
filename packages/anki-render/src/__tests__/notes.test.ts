// Which note types are Image Occlusion, and the line of text that stands for a note.
import { describe, expect, it } from 'vitest';
import { isImageOcclusion, noteSortText } from '../notes';

const template = (qfmt: string) => ({ qfmt, afmt: '' });

describe('isImageOcclusion', () => {
  it('is whatever Anki marked as the stock Image Occlusion, even if it is no cloze', () => {
    expect(isImageOcclusion({ kind: 'normal', templates: [], originalStockKind: 6 })).toBe(true);
  });

  it('is a cloze note type whose front holds the occlusion container', () => {
    const cloze = {
      kind: 'cloze' as const,
      templates: [template('<div id="image-occlusion-container"></div>')],
    };
    expect(isImageOcclusion(cloze)).toBe(true);
    expect(isImageOcclusion({ ...cloze, originalStockKind: null })).toBe(true);
  });

  it('is not an ordinary cloze, another stock kind, or a normal type that mentions the container', () => {
    expect(isImageOcclusion({ kind: 'cloze', templates: [template('{{cloze:Text}}')] })).toBe(
      false,
    );
    expect(isImageOcclusion({ kind: 'cloze', templates: [], originalStockKind: 1 })).toBe(false);
    expect(
      isImageOcclusion({ kind: 'normal', templates: [template('image-occlusion-container')] }),
    ).toBe(false);
  });
});

describe('noteSortText', () => {
  it('is the sort field, as a line without tags, cloze marks or sounds', () => {
    expect(
      noteSortText(['other', '<b>The {{c1::heart::organ}}</b><br>beats [sound:a.mp3]'], 1),
    ).toBe('The heart beats');
  });

  it('when that field has no text, it is the first field that has some', () => {
    expect(noteSortText(['', '  <br> ', 'third', 'fourth'], 1)).toBe('third');
    expect(noteSortText(['', 'x'], 5)).toBe('x');
  });

  it('a field of occlusion shapes has no text to give, and neither has a note with only shapes', () => {
    expect(noteSortText(['{{c1::image-occlusion:rect:left=1}}', 'caption'], 0)).toBe('caption');
    expect(noteSortText(['{{c1::image-occlusion:rect:left=1}}', ''], 0)).toBe('');
    expect(noteSortText([], 0)).toBe('');
  });
});
