// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readApkgFile } from '@qv/anki-format';
import {
  clozeNumbers,
  decodeEntities,
  encodeAttribute,
  fieldIsEmpty,
  htmlToTextLine,
  imageClozeData,
  isImageOcclusion,
  noteSortText,
  renderCard,
  revealClozeText,
  revealClozeTextOnly,
  stripClozes,
  stripHtml,
} from '../src';
import type { RenderCardInput } from '../src';
import { compareWithAnki } from './golden';
import type { GoldenCard } from './golden';

const SAMPLE = join(import.meta.dirname, '../../anki-format/test/fixtures/sample.apkg');
const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, 'golden/sample.json'), 'utf8'),
) as GoldenCard[];

describe('golden: the same HTML as Anki 25.9.5', () => {
  it('every card of the sample deck, front and back', async () => {
    const r = compareWithAnki(await readApkgFile(SAMPLE), GOLDEN);
    expect(r.missing).toEqual([]);
    expect(r.different).toEqual([]);
    expect(r.equal).toBe(16);
  });
});

const basic = (qfmt: string, afmt = '{{FrontSide}}<hr id=answer>{{Back}}') => ({
  name: 'Basic',
  kind: 'normal' as const,
  fields: ['Front', 'Back', 'Extra'],
  templates: [{ name: 'Card 1', qfmt, afmt }],
});

const input = (changes: Partial<RenderCardInput>): RenderCardInput => ({
  noteType: basic('{{Front}}'),
  fields: ['front', 'back', ''],
  tags: ['a', 'b'],
  ord: 0,
  deckName: 'Parent::Child',
  ...changes,
});

describe('templates', () => {
  it('fields, FrontSide and special fields', () => {
    const r = renderCard(
      input({ noteType: basic('{{Front}} {{Deck}} {{Subdeck}} {{Tags}} {{Card}} {{Type}}') }),
    );
    expect(r.question).toBe('front Parent::Child Child a b Card 1 Basic');
    expect(r.answer).toBe(`${r.question}<hr id=answer>back`);
  });

  it('conditionals: a field with only <br>, <div> or spaces is empty; &nbsp; is not', () => {
    const t = basic('{{Front}}:{{#Extra}}con{{/Extra}}{{^Extra}}sin{{/Extra}}');
    for (const empty of ['', ' \n', '<br>', '<BR />', '<div><br/></div>', '</div>']) {
      expect(renderCard(input({ noteType: t, fields: ['f', 'b', empty] })).question).toBe('f:sin');
    }
    for (const full of ['&nbsp;', '<p></p>', 'x', '<img src="a.png">']) {
      expect(renderCard(input({ noteType: t, fields: ['f', 'b', full] })).question).toBe('f:con');
    }
    expect(fieldIsEmpty('<br><div> </div>')).toBe(true);
  });

  it('a front that renders nothing is an empty card', () => {
    const r = renderCard(input({ noteType: basic('{{#Extra}}{{Extra}}{{/Extra}}') }));
    expect(r.isEmpty).toBe(true);
  });

  it('unknown fields and unclosed conditionals are template errors', () => {
    expect(renderCard(input({ noteType: basic('{{Nope}}') })).error).toMatch(/no field called/);
    expect(renderCard(input({ noteType: basic('{{#Front}}x') })).error).toMatch(/Missing/);
    expect(renderCard(input({ noteType: basic('{{/Front}}') })).error).toMatch(/missing/);
  });

  it('text:, hint: and unknown filters (the text passes through)', () => {
    const t = basic('{{text:Front}}|{{hint:Back}}|{{rare:Front}}|{{text:rare:Front}}');
    const r = renderCard(input({ noteType: t, fields: ['<b>a &amp; b</b>', 'pista', ''] }));
    const [text, hint, rare, both] = r.question.split('|');
    expect(text).toBe('a & b');
    expect(hint).toContain('<a class=hint href="#"');
    expect(hint).toContain('class=hint style="display: none">pista</div>');
    expect(rare).toBe('<b>a &amp; b</b>');
    expect(both).toBe('<b>a &amp; b</b>');
  });

  it('the hint id is blake3, like Anki', () => {
    // Same id as Anki's own test: hint_filter("foo", "field").
    const t = { ...basic('{{hint:field}}', '{{FrontSide}}'), fields: ['field'] };
    const r = renderCard(input({ noteType: t, fields: ['foo'] }));
    expect(r.question).toContain("getElementById('hint83fe48607f0f3a66')");
  });

  it('comments stay; the alternative syntax works; {{=<% %>=}}', () => {
    expect(renderCard(input({ noteType: basic('<!-- {{Back}} -->{{Front}}') })).question).toBe(
      '<!-- {{Back}} -->front',
    );
    expect(renderCard(input({ noteType: basic('{{=<% %>=}}<%Front%>') })).question).toBe('front');
  });

  it('sounds become play markers', () => {
    const r = renderCard(input({ fields: ['[sound:a.mp3] y [sound:b.mp3]', '', ''] }));
    expect(r.question).toBe('[anki:play:q:0] y [anki:play:q:1]');
  });
});

describe('cloze', () => {
  const text = 'La {{c1::columna}} tiene {{c2::33::número}} vértebras {{c1::y discos}}.';

  it('front with [...] or the hint, back with the answer and the other gaps visible', () => {
    expect(revealClozeText(text, 2, true)).toBe(
      'La <span class="cloze-inactive" data-ordinal="1">columna</span> tiene ' +
        '<span class="cloze" data-cloze="33" data-ordinal="2">[número]</span> vértebras ' +
        '<span class="cloze-inactive" data-ordinal="1">y discos</span>.',
    );
    expect(revealClozeText(text, 1, false)).toContain(
      '<span class="cloze" data-ordinal="1">columna</span>',
    );
    expect(revealClozeText(text, 3, true)).toBe('');
  });

  it('nested clozes (Anki tests)', () => {
    expect(revealClozeText('foo {{c1::bar {{c2::baz}}::qux}}', 2, true)).toBe(
      'foo <span class="cloze-inactive" data-ordinal="1">bar <span class="cloze" data-cloze="baz" data-ordinal="2">[...]</span></span>',
    );
    expect(stripHtml(revealClozeText('foo {{c1::bar {{c2::baz}}::qux}}', 1, true))).toBe(
      'foo [qux]',
    );
  });

  it('numbers, cloze-only and strip', () => {
    expect([...clozeNumbers('{{c2::te{{c1::s}}}}t{{')].sort()).toEqual([1, 2]);
    expect([...clozeNumbers('{{c0::te}}s{{c2::t}}s')]).toEqual([2]);
    expect(revealClozeTextOnly('{{c1::foo}} {{c1::bar}}', 1, false)).toBe('foo, bar');
    expect(revealClozeTextOnly('foo {{c1::bar::baz}}', 1, true)).toBe('baz');
    expect(stripClozes('The {{c1::moon::🌛}} {{c2::orbits::"::"}} the {{c3::🌏}}.')).toBe(
      'The moon orbits the 🌏.',
    );
  });

  it('a card whose cloze is not in the note is empty', () => {
    const t = {
      name: 'Cloze',
      kind: 'cloze' as const,
      fields: ['Text'],
      templates: [{ name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
    };
    expect(renderCard(input({ noteType: t, fields: ['{{c1::a}}'], ord: 1 })).isEmpty).toBe(true);
    expect(renderCard(input({ noteType: t, fields: ['{{c1::a}}'], ord: 0 })).isEmpty).toBe(false);
  });
});

describe('image occlusion', () => {
  it('data attributes like Anki (Anki tests)', () => {
    expect(imageClozeData('rect:left=10:top=20:width=30:height=10')).toBe(
      'data-shape="rect" data-left="10" data-top="20" data-width="30" data-height="10" ',
    );
    expect(imageClozeData('polygon:points=0,0 10,10 20,0')).toBe(
      'data-shape="polygon" data-points="0,0 10,10 20,0" ',
    );
    expect(imageClozeData('text:text=foo\\:bar:left=10')).toBe(
      'data-shape="text" data-text="foo&#x3A;bar" data-left="10" ',
    );
    expect(imageClozeData('rect:left=.1:width=0:oi=1')).toBe(
      'data-shape="rect" data-left=".1" data-occludeInactive="1" ',
    );
  });

  it('active, inactive and highlighted shapes', () => {
    const field = '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}';
    expect(revealClozeText(field, 1, true)).toBe(
      '<div class="cloze" data-ordinal="1" data-shape="rect" data-left=".1" data-top=".2" data-width=".3" data-height=".4" data-occludeInactive="1" ></div>',
    );
    expect(revealClozeText(field, 1, false)).toMatch(/^<div class="cloze-highlight"/);
    expect(revealClozeText(`${field}{{c2::x}}`, 2, true)).toMatch(/^<div class="cloze-inactive"/);
  });

  it('detects the note type', () => {
    expect(
      isImageOcclusion({
        kind: 'cloze',
        templates: [{ qfmt: '', afmt: '' }],
        originalStockKind: 6,
      }),
    ).toBe(true);
    expect(
      isImageOcclusion({
        kind: 'cloze',
        templates: [{ qfmt: '<div id="image-occlusion-container">', afmt: '' }],
      }),
    ).toBe(true);
    expect(
      isImageOcclusion({ kind: 'cloze', templates: [{ qfmt: '{{cloze:T}}', afmt: '' }] }),
    ).toBe(false);
  });
});

describe('html helpers', () => {
  it('encodeAttribute like htmlescape', () => {
    expect(encodeAttribute('a b="c"&<d>\'é—x')).toBe(
      'a&#x20;b&#x3D;&quot;c&quot;&amp;&lt;d&gt;&#x27;&#xE9;—x',
    );
  });

  it('decodeEntities gives up on malformed entities, like Anki', () => {
    expect(decodeEntities('a &amp; b&nbsp;c &#233; &#xE9;')).toBe('a & b c é é');
    expect(decodeEntities('a & b')).toBe('a & b');
    expect(decodeEntities('&amp; &nope;')).toBe('&amp; &nope;');
  });

  it('a line of text and the sort text of a note', () => {
    expect(htmlToTextLine('<div>a</div><br>b\n<i>c</i> [sound:x.mp3]')).toBe('a b c');
    expect(noteSortText(['¿Qué <b>es</b>?', 'x'], 0)).toBe('¿Qué es?');
    expect(noteSortText(['{{c1::7}} vértebras {{c2::cervicales::tipo}}'], 0)).toBe(
      '7 vértebras cervicales',
    );
    expect(
      noteSortText(['{{c1::image-occlusion:rect:left=.1}}', '<img src="a.png">', 'Vértebra'], 0),
    ).toBe('Vértebra');
  });
});
