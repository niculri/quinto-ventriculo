// Tests the extras buttons of the author's note types through the card sanitizer: panels keep `hidden`, buttons lose
// their inline handler.
import { describe, expect, it } from 'vitest';
import { sanitizeCard } from '../card';

const none = async () => null;

describe('sanitizeCard extras', () => {
  const html =
    '<div class="extras"><button class="bt" data-k="c" onclick="var p=1;p.hidden=!p.hidden">Fuente</button>' +
    '<div class="panel fuente" data-k="c" hidden="">Texto</div></div><script>alert(1)</script>';

  it('keeps `hidden` and `data-k`, and removes the inline handler and the script', async () => {
    const { html: clean } = await sanitizeCard(html, none);
    expect(clean).toBe(
      '<div class="extras"><button class="bt" data-k="c">Fuente</button>' +
        '<div class="panel fuente" data-k="c" hidden="">Texto</div></div>',
    );
  });

  it('a panel without `hidden` stays open', async () => {
    const { html: clean } = await sanitizeCard('<div class="panel" data-k="b">x</div>', none);
    expect(clean).toBe('<div class="panel" data-k="b">x</div>');
  });

  it('keeps an empty `alt`, and `hidden` with a value', async () => {
    const { html: clean } = await sanitizeCard(
      '<img src="x.png" alt=""><div class="panel" hidden="until-found">t</div>',
      async () => ({ key: 'cards/x.webp' }),
    );
    expect(clean).toBe(
      '<img alt="" data-media="cards/x.webp" /><div class="panel" hidden="until-found">t</div>',
    );
  });
});
