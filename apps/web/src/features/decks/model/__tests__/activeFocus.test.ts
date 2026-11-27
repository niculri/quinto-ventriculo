// Tests where the image viewer opens on an occlusion: the middle of the masks asked for, or of those revealed.
import { describe, expect, it } from 'vitest';
import { activeFocus } from '../activeFocus';
import { shapes } from './occlusionFixtures';

describe('activeFocus', () => {
  it('is the middle of the masks asked for, of every kind', () => {
    const root = shapes(`
      <div class="cloze" data-shape="rect" data-left=".1" data-top=".2" data-width=".2" data-height=".1"></div>
      <div class="cloze" data-shape="ellipse" data-left=".5" data-top=".5" data-rx=".1" data-ry=".05"></div>
      <div class="cloze-inactive" data-shape="rect" data-left=".9" data-top=".9" data-width=".1" data-height=".1"></div>`);
    const focus = activeFocus(root)!;
    expect(focus.x).toBeCloseTo(0.4);
    expect(focus.y).toBeCloseTo(0.4);
  });

  it('on the back, the middle of the revealed ones; a polygon and a text count too', () => {
    const root = shapes(`
      <div class="cloze-highlight" data-shape="polygon" data-left=".2" data-top=".2" data-points=".2,.2 .4,.2 .4,.6"></div>
      <div class="cloze-highlight" data-shape="text" data-left=".6" data-top=".2" data-text="x" data-scale="1"></div>`);
    const focus = activeFocus(root)!;
    expect(focus.x).toBeCloseTo(0.4);
    expect(focus.y).toBeCloseTo(0.4);
  });

  it('is nothing on a card without masks', () => {
    expect(activeFocus(shapes('<p>Sin máscaras</p>'))).toBeNull();
  });
});
