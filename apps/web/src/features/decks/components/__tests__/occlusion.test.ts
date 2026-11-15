// Tests Image Occlusion set up on a card side: the «toggle» button.

import { describe, expect, it } from 'vitest';
import { setupOcclusion } from '../occlusion';
import { shapes } from '../../model/__tests__/occlusion-fixtures';

describe('image occlusion (like Anki review.ts)', () => {
  const rect = (cls: string, ord: number, extra = 'data-occludeinactive="1"') =>
    `<div class="${cls}" data-ordinal="${ord}" data-shape="rect" data-left=".1" data-top=".2" data-width=".3" data-height=".4" ${extra}></div>`;

  it('the «toggle» button hides itself without «hide all» masks', () => {
    const container = (oi: string) =>
      shapes(
        `<div style="display:none">${rect('cloze-highlight', 1, oi)}</div>` +
          '<div id="image-occlusion-container"><img src="x"><canvas id="image-occlusion-canvas"></canvas></div>' +
          '<button id="toggle">x</button>',
      );
    const without = container('');
    const cleanup = setupOcclusion(without);
    expect(without.querySelector<HTMLElement>('#toggle')!.style.display).toBe('none');
    cleanup();
    const withOi = container('data-occludeinactive="1"');
    setupOcclusion(withOi)();
    expect(withOi.querySelector<HTMLElement>('#toggle')!.style.display).toBe('');
  });
});
