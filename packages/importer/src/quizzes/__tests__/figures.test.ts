// Tests the sanitizing of the SVG figures of a test.
import { sanitizeSvg } from '@qv/html/sanitize';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordingProcessor } from '../../test/quizFixtures';
import { convertFigure } from '../figures';
import type { QuizState } from '../figures';
import type { FigureSpec } from '../chartSpecs';
const didNotFail = (): never => {
  throw new Error('it should have failed');
};

describe('SVG figures', () => {
  it('keep every drawing tag and attribute', () => {
    const svg =
      '<svg viewBox="0 0 10 10" width="10" role="img" aria-label="a &gt; b"><g transform="translate(1,1)"><rect x="1" y="1" width="2" height="2" fill="var(--g1)" fill-opacity="0.2"/><text x="1" y="2" font-family="var(--fbody)">5\'<tspan dy="-3">2</tspan></text><path d="M0 0L1 1" stroke="var(--ink)" stroke-dasharray="2 2"/></g></svg>';
    const r = sanitizeSvg(svg);
    expect(r.dropped).toEqual([]);
    expect(r.svg).toContain('viewBox="0 0 10 10"');
    expect(r.svg).toContain(
      '<rect x="1" y="1" width="2" height="2" fill="var(--g1)" fill-opacity="0.2" />',
    );
    expect(r.svg).toContain('<tspan dy="-3">2</tspan>');
  });

  it('drop scripts, events, links, foreign objects and external references, and say so', () => {
    const r = sanitizeSvg(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="1" height="1"/></a><foreignObject><div>x</div></foreignObject><image href="https://x/y.png"/><rect fill="url(https://x/#p)" width="1"/><use href="#a"/></svg>',
    );
    expect(r.svg).not.toMatch(/onload|script|javascript|href|foreignObject|image|use|url\(/);
    expect(r.svg).toContain('<rect width="1" height="1" />');
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it('drop ids (they would collide between figures on the same page) and say so', () => {
    const r = sanitizeSvg('<svg><rect id="a" width="1"/></svg>');
    expect(r.svg).toBe('<svg><rect width="1" /></svg>');
    expect(r.dropped).toEqual(['atributos quitados: id']);
  });

  it('drop a paint with a CSS escape (`u\\72 l(` is `url(`), also written as an entity', () => {
    const r = sanitizeSvg(
      '<svg><rect width="1" fill="u\\72 l(https://x/y.svg#p)"/><rect width="2" stroke="u&#92;72 l(//x/z.svg#p)"/></svg>',
    );
    expect(r.svg).toBe('<svg><rect width="1" /><rect width="2" /></svg>');
    expect(r.dropped.length).toBeGreaterThan(0);
  });
});

describe('convertFigure', () => {
  let folder: string;
  let png: Buffer;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'qv-figures-'));
    png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#2a6' } })
      .png()
      .toBuffer();
    await writeFile(join(folder, 'f.png'), png);
  });
  afterAll(() => rm(folder, { recursive: true, force: true }));

  const stateOf = () => {
    const { process, inputs } = recordingProcessor();
    let calls = 0;
    const state: QuizState = {
      slug: 'prueba',
      folder,
      processImage: (data) => {
        calls++;
        return process(data);
      },
      media: new Map(),
      warnings: [],
      images: new Map(),
      positional: [],
    };
    return { state, inputs, calls: () => calls };
  };
  const convert = (state: QuizState, spec: object) =>
    convertFigure(state, spec as FigureSpec, 'p1');

  it('an image is read from the folder, processed once per source and kept in the media of the test', async () => {
    const { state, calls } = stateOf();
    const a = await convert(state, {
      tipo: 'imagen',
      src: 'f.png',
      alt: 'Foto',
      ancho: 200,
      pie: 'Pie',
    });
    const b = await convert(state, { tipo: 'imagen', src: 'f.png' });
    expect(calls()).toBe(1);
    expect(a).toMatchObject({
      kind: 'image',
      width: 30,
      height: 20,
      alt: 'Foto',
      displayWidth: 200,
      caption: 'Pie',
    });
    expect(b).toMatchObject({ kind: 'image', media: a.kind === 'image' ? a.media : '', alt: '' });
    expect(b).not.toHaveProperty('displayWidth');
    expect(b).not.toHaveProperty('caption');
    expect([...state.media.keys()]).toHaveLength(1);
    expect(await [...state.media.values()][0]!.read()).toEqual(png);
  });

  it('an inline data image is decoded, and a width or caption that is not usable is left out', async () => {
    const { state, inputs } = stateOf();
    const src = `data:image/png;base64,${png.toString('base64')}`;
    const f = await convert(state, { tipo: 'imagen', src, ancho: 0, pie: '   ' });
    expect(f).not.toHaveProperty('displayWidth');
    expect(f).not.toHaveProperty('caption');
    expect([...inputs.values()][0]!.equals(png)).toBe(true);
  });

  it('an image that is not in the folder names the test, the question and the file', async () => {
    const { state } = stateOf();
    await expect(convert(state, { tipo: 'imagen', src: 'falta.png' })).rejects.toThrow(
      'prueba: p1: no existe la imagen falta.png',
    );
  });

  it('a chart that cannot be drawn names its kind and why, and keeps the cause', async () => {
    const { state } = stateOf();
    const error = await convert(state, {
      tipo: 'barras',
      categorias: ['A', 'B'],
      valores: [1],
      y_max: 2,
      y_paso: 1,
    }).then(didNotFail, (e: unknown) => e as Error);
    expect(error.message).toBe(
      'prueba: p1: no se pudo dibujar el gráfico «barras» (hay valores que no son números)',
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('a raw SVG is sanitized and what was dropped becomes a warning of its question', async () => {
    const { state } = stateOf();
    const f = await convert(state, {
      tipo: 'svg',
      svg: '<svg viewBox="0 0 1 1"><script>x()</script><rect width="1"/></svg>',
      ancho: 120,
    });
    expect(f).toMatchObject({ kind: 'svg', displayWidth: 120 });
    expect(f.kind === 'svg' && f.svg).not.toContain('script');
    expect(state.warnings).toHaveLength(1);
    expect(state.warnings[0]).toMatch(/^prueba: p1: figura SVG con /);
  });
});
