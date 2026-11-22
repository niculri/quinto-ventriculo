// Tests of the Markdown note converter: headings, figures, callouts, guide questions, sanitizing and sections.
import { describe, expect, it } from 'vitest';
import { convertNote, listImages } from '../convert';
import type { ImageResolver } from '../convert';

const resolver: ImageResolver = (path) => ({ key: `k/${path}`, width: 800, height: 600 });
const convert = (md: string) => convertNote(md, resolver);

describe('convertNote', () => {
  it('takes the title and the creation date from the header', () => {
    const r = convert('# Traducción\n<!-- creado: 2026-09-30 -->\n\nHola.');
    expect(r.title).toBe('Traducción');
    expect(r.createdOn).toBe('2026-09-30');
    expect(r.html).not.toContain('Traducción');
    expect(r.html).not.toContain('creado');
  });

  it('adds unique anchors to the headings and builds the TOC with h2 and h3', () => {
    const r = convert('## 1. Núcleo\n\ntexto\n\n### Poros\n\n#### Detalle\n\n## Núcleo\n');
    expect(r.toc).toEqual([
      { anchor: '1-nucleo', title: '1. Núcleo', level: 2 },
      { anchor: 'poros', title: 'Poros', level: 3 },
      { anchor: 'nucleo', title: 'Núcleo', level: 2 },
    ]);
    expect(r.html).toContain('<h4 id="detalle">');
  });

  it('writes × for ✕, which the site’s font does not have, and keeps the superscripts as written', () => {
    const r = convert('Sin ✕ ni ✕: Ca²⁺, CO₂, IP<sub>3</sub> y 4<sup>3</sup>.');
    expect(r.html).toBe('<p>Sin × ni ×: Ca²⁺, CO₂, IP<sub>3</sub> y 4<sup>3</sup>.</p>\n');
  });

  it('converts a figure with width and caption, without src', () => {
    const r = convert('![El **codón** de inicio (diap. 4)](imagenes/d04.png){62%}');
    expect(r.html).toContain('<figure class="figure" style="width:62%">');
    expect(r.html).toContain('data-media="k/imagenes/d04.png"');
    expect(r.html).toContain('alt="El codón de inicio (diap. 4)"');
    expect(r.html).toContain('width="800" height="600"');
    expect(r.html).toContain(
      '<figcaption>El <strong>codón</strong> de inicio (diap. 4)</figcaption>',
    );
    expect(r.html).not.toMatch(/\ssrc=/);
  });

  it('the alt text honors asterisks that are not italics and escapes', () => {
    const r = convert(
      '![Niveles; * p < 0,05, ** p < 0,01, *** p < 0,001 y \\*\\* (Li, *Aging* 2020)](a.png)',
    );
    expect(r.html).toContain(
      'alt="Niveles; * p &lt; 0,05, ** p &lt; 0,01, *** p &lt; 0,001 y ** (Li, Aging 2020)"',
    );
  });

  it('marks the large plate {88%!}', () => {
    const r = convert('![Netter](a.png){88%!}');
    expect(r.html).toContain('class="figure figure-plate" style="width:88%"');
  });

  it('puts several images of one line in a row, without widths', () => {
    const r = convert('![A](a.png){40%} ![B](b.png){40%}');
    expect(r.html).toContain('<div class="figure-row">');
    expect(r.html.match(/<figure/g)).toHaveLength(2);
    expect(r.html).not.toContain('width:40%');
  });

  it('honors the ::: der block with the floating image and the text inside', () => {
    const r = convert('::: der ![Ribosoma](r.png){50%}\n- **uno**\n- dos\n:::\n\nDespués.');
    expect(r.html).toMatch(
      /<div class="side side-right"><figure class="figure figure-float" style="width:50%">.*<ul>\s*<li><strong>uno<\/strong><\/li>/s,
    );
    expect(r.html).toMatch(/<\/div>\s*<p>Después.<\/p>/);
  });

  it('converts the callouts with their label', () => {
    const r = convert('> [!profe] **Transcribir o traducir.** El idioma.\n> Segunda línea.');
    expect(r.html).toContain('<aside class="callout callout-profe">');
    expect(r.html).toContain('<p class="callout-label">Lo que enfatizó el profe</p>');
    expect(r.html).toContain('<strong>Transcribir o traducir.</strong> El idioma.');
  });

  it('uses the leading bold text as the title of the error callout and drops the ⚠️', () => {
    const r = convert(
      '> [!error] ⚠️ **Error en la diapositiva 2:** dice TAC. **Lo correcto:** TAG.',
    );
    expect(r.html).toContain('<p class="callout-label">Error en la diapositiva 2</p>');
    expect(r.html).toContain('<p>dice TAC. <strong>Lo correcto:</strong> TAG.</p>');
    expect(r.html).not.toContain('⚠');
  });

  it('the callout without a type is a plain note, without a label', () => {
    const r = convert('> Un dato.');
    expect(r.html).toMatch(/^<aside class="callout callout-note"><p>Un dato.<\/p>\s*<\/aside>/);
  });

  it('puts the image inside the callout', () => {
    const r = convert('> [!libro] Texto.\n> ![Lodish](l.png){30%}\n> *(Lodish, pág. 12)*');
    expect(r.html).toMatch(/callout-libro.*figure-float.*Texto\./s);
    expect(r.html).toContain('<p class="source">(Lodish, pág. 12)</p>');
  });

  it('separates the source line from the previous bullet', () => {
    const r = convert('- dato\n*(Alberts, pág. 3)*');
    expect(r.html).toMatch(/<\/ul>\s*<p class="source">\(Alberts, pág. 3\)<\/p>/);
  });

  it('converts tables and keeps <sup>, <sub> and <br/>', () => {
    const r = convert('| A | B |\n|---|---|\n| 4<sup>3</sup> | H<sub>2</sub>O<br/>agua |');
    expect(r.html).toContain('<table>');
    expect(r.html).toContain('4<sup>3</sup>');
    expect(r.html).toContain('H<sub>2</sub>O<br />agua');
  });

  it('removes the PDF page breaks', () => {
    const r = convert(
      'Uno\n\n<div class="nueva"></div>\n\nDos\n\n<div style="break-before: page"></div>',
    );
    expect(r.html).not.toContain('<div');
  });

  it('removes dangerous HTML', () => {
    const r = convert(
      'Hola <script>alert(1)</script><img src=x onerror=alert(1)> [x](javascript:alert(1))',
    );
    expect(r.html).not.toMatch(/<script|onerror|href="javascript|src=/i);
  });

  it("keeps only the converter's classes (not the web's)", () => {
    const r = convert('<div class="fixed inset-0 z-50 callout">tapa todo</div>\n\n> [!ojo] x');
    expect(r.html).toContain('<div class="callout">tapa todo</div>');
    expect(r.html).toContain('<aside class="callout callout-ojo">');
    expect(r.html).not.toMatch(/fixed|inset-0|z-50/);
  });

  it('an image it cannot find is an error', () => {
    const r = convertNote('![x](no.png)', () => null);
    expect(r.errors).toEqual(['Imagen no encontrada: no.png']);
    expect(r.html).toContain('missing-image');
  });

  it('a figure whose syntax is not recognized is an error, not a lost image', () => {
    const cases = [
      '![Con espacios](imagenes/una figura.png){40%}',
      '![Ancho raro](a.png){40}',
      'Texto con ![una imagen](a.png) en medio.',
      '::: der ![Ruta con espacios](mis imagenes/a.png){40%}\nTexto\n:::',
      '> [!clinica] Algo.\n> ![Ancho raro](a.png){30 %}',
      '| A |\n|---|\n| ![celda](a.png) |',
    ];
    for (const md of cases) {
      const r = convert(md);
      expect(r.errors, md).not.toEqual([]);
      expect(r.errors.join(' '), md).toMatch(/Figura que no se reconoce|Bloque «:::»/);
    }
    expect(convert('Texto\n:::\n').errors).toEqual([
      'Bloque «:::» que no se reconoce (le falta su imagen): «:::»',
    ]);
    expect(convert('::: der ![a](a.png){40%}\nTexto.\n\n## 2. Otra sección').errors).toEqual([
      'Bloque «:::» sin su cierre «:::»: «::: der ![a](a.png){40%}»',
    ]);
    expect(convert('<img src="imagenes/a.png" alt="a">').errors).toEqual([
      'Figura que no se reconoce: «<img src="imagenes/a.png" alt="a">»',
    ]);
    expect(
      convert('![a](a.png){40%}\n\n![b](b.png) ![c](c.png)\n\n::: izq ![d](d.png)\nx\n:::').errors,
    ).toEqual([]);
  });

  it('«Datos clave» is its own callout', () => {
    const r = convert(
      '> [!datos]\n> - La **traducción** ocurre en los ribosomas.\n> - AUG = metionina.',
    );
    expect(r.html).toMatch(
      /^<aside class="callout callout-datos"><p class="callout-label">Datos clave<\/p><ul>\s*<li>La <strong>traducción<\/strong>/,
    );
  });

  it('the clinical callout says «Relevancia clínica»', () => {
    const r = convert('> [!clinica] **Anemia falciforme.** GAG → GUG.');
    expect(r.html).toContain(
      '<aside class="callout callout-clinica"><p class="callout-label">Relevancia clínica</p>',
    );
    expect(r.html).toContain('<strong>Anemia falciforme.</strong> GAG → GUG.');
  });

  it('a quote that starts with «**Pregunta …**» is a question of the guide', () => {
    const a = convert('> **Pregunta a.** *¿Qué es una toxina de prueba?*\n\nRespuesta.');
    expect(a.html).toContain(
      '<aside class="callout callout-question"><p class="callout-label">Pregunta de la guía <span class="callout-tag">a)</span></p><p><em>¿Qué es una toxina de prueba?</em></p>',
    );
    expect(a.html).toContain('<p>Respuesta.</p>');
    const b = convert('> **Pregunta de la guía.** *¿Qué color toma el núcleo con hematoxilina?*');
    expect(b.html).toContain(
      '<p class="callout-label">Pregunta de la guía</p><p><em>¿Qué color toma el núcleo con hematoxilina?</em></p>',
    );
    expect(b.html).not.toContain('callout-tag');
    expect(convert('> **Ojo:** algo.').html).toContain('callout-note');
  });

  it('with guideQuestions, a whole italic line «*a) …*» is a question of the guide', () => {
    const md = '*a) ¿Qué indica la notación X100Y?*\n\nLa notación…\n\n*C. b) Identifiquen X 100.*';
    const r = convertNote(md, resolver, { guideQuestions: true });
    expect(r.html).toContain(
      '<p class="callout-label">Pregunta de la guía <span class="callout-tag">a)</span></p><p><em>¿Qué indica la notación X100Y?</em></p>',
    );
    expect(r.html).toContain('<span class="callout-tag">C. b)</span>');
    expect(convert(md).html).toContain('<p><em>a) ¿Qué indica la notación X100Y?</em></p>');
    const other = convertNote('**a) Negrita**\n\n*Una frase en cursiva.*', resolver, {
      guideQuestions: true,
    });
    expect(other.html).not.toContain('callout-question');
  });

  it('#### headings get an anchor and stay out of the TOC', () => {
    const r = convert('## 1. CFTR\n\n#### Cómo se abre el canal\n\nTexto.');
    expect(r.html).toContain('<h4 id="como-se-abre-el-canal">Cómo se abre el canal</h4>');
    expect(r.toc).toEqual([{ anchor: '1-cftr', title: '1. CFTR', level: 2 }]);
  });

  it('«## Resumen» and what follows it go in their own section', () => {
    const r = convert('## 1. Uno\n\nTexto.\n\n## Resumen\n\n- Idea **clave**.\n- Otra.');
    expect(r.html).toMatch(
      /<p>Texto.<\/p>\s*<section class="note-summary"><h2 id="resumen">Resumen<\/h2>\s*<ul>[\s\S]*<\/ul>\s*<\/section>$/,
    );
    expect(r.toc.map((t) => t.anchor)).toEqual(['1-uno', 'resumen']);
    const after = convert('## Resumen\n\nCierre.\n\n## Anexo\n\nMás.');
    expect(after.html).toMatch(/<\/section>\s*<h2 id="anexo">/);
  });

  it('splits the text into sections for search', () => {
    const r = convert(
      '# Título\n\nIntro.\n\n## Uno\n\nTexto **uno**.\n\n### Sub\n\nMás &amp; más.',
    );
    expect(r.sections).toEqual([
      { anchor: '', title: 'Título', level: 1, text: 'Intro.' },
      { anchor: 'uno', title: 'Uno', level: 2, text: 'Texto uno.' },
      { anchor: 'sub', title: 'Sub', level: 3, text: 'Más & más.' },
    ]);
  });
});

describe('listImages', () => {
  it('lists every path once, in order', () => {
    expect(listImages('![a](1.png) ![b](2.png){40%}\n::: der ![c](1.png)\n> ![d](3.png)')).toEqual([
      '1.png',
      '2.png',
      '3.png',
    ]);
  });
});

describe('the title and what comes before it', () => {
  it('takes the first level-1 heading as the title even after blank lines', () => {
    expect(convert('\n\n# Título\ntexto')).toMatchObject({
      title: 'Título',
      html: '<p>texto</p>\n',
    });
  });

  it('after any text a level-1 heading is not the title: the sanitizer keeps only its words', () => {
    const r = convert('texto\n# Otro\nfin');
    expect(r.title).toBeNull();
    expect(r.html).toBe('<p>texto</p>\nOtro\n<p>fin</p>\n');
  });

  it('only the first level-1 heading is the title', () => {
    const r = convert('# A\n# B');
    expect(r.title).toBe('A');
    expect(r.html).toBe('B\n');
  });

  it('the first creation date wins, and a page-break marker leaves no trace', () => {
    const r = convert(
      '<!-- creado: 2026-01-02 -->\n<!-- creado: 2027-03-04 -->\n<div class="nueva"></div>\ntexto',
    );
    expect(r.createdOn).toBe('2026-01-02');
    expect(r.html).toBe('<p>texto</p>\n');
  });
});

describe('callouts', () => {
  it('«dato» is an ordinary note', () => {
    expect(convert('> [!dato] cuerpo').html).toBe(
      '<aside class="callout callout-note"><p>cuerpo</p>\n</aside>\n',
    );
  });

  it('an error callout takes its label from the bold opening, without the final colon', () => {
    const html = convert(
      '> [!error] **Error en la diapositiva:** dice mal. **Lo correcto:** bien.',
    ).html;
    expect(html).toContain('<p class="callout-label">Error en la diapositiva</p>');
    expect(html).toContain('<p>dice mal. <strong>Lo correcto:</strong> bien.</p>');
  });

  it('an error callout with no bold opening is labeled «Error», and its warning sign is dropped', () => {
    const html = convert('> [!error] ⚠️ texto').html;
    expect(html).toContain('<p class="callout-label">Error</p><p>texto</p>');
    expect(html).not.toContain('⚠');
  });

  it('a question is a callout of its own, tagged with its letter or number, except «de la guía»', () => {
    expect(convert('> **Pregunta 3.** ¿cuál?\n> más').html).toContain(
      '<p class="callout-label">Pregunta de la guía <span class="callout-tag">3)</span></p><p>¿cuál?\nmás</p>',
    );
    const plain = convert('> **Pregunta de la guía.** ¿cuál?').html;
    expect(plain).toContain('<p class="callout-label">Pregunta de la guía</p>');
    expect(plain).not.toContain('callout-tag');
    expect(convert('> **Pregunta DE LA GUÍA.** ¿cuál?').html).not.toContain('callout-tag');
  });

  it('only a note can be a question, not another kind of callout', () => {
    expect(convert('> [!clave] **Pregunta 1.** x').html).not.toContain('callout-question');
  });

  it('a figure inside floats at 38 % unless it asks for 55 % or more, which makes it wide', () => {
    const wide = convert('> [!clave] hola\n> ![fig](a.png){60%}').html;
    expect(wide).toContain('class="figure figure-wide" style="width:60%"');
    const narrow = convert('> [!clave] hola\n> ![fig](a.png){54%}').html;
    expect(narrow).toContain('class="figure figure-float" style="width:54%"');
    expect(convert('> [!clave] hola\n> ![fig](a.png){55%}').html).toContain('figure-wide');
    expect(convert('> [!clave] hola\n> ![fig](a.png)').html).toContain('style="width:38%"');
  });
});

describe('figures and the blocks around them', () => {
  it('a side block floats its image to the right or the left, with the text beside it', () => {
    const right = convert('::: der ![pie](a.png){150%!}\ntexto\n:::').html;
    expect(right).toBe(
      '<div class="side side-right"><figure class="figure figure-float figure-plate" style="width:100%"><img data-media="k/a.png" alt="pie" width="800" height="600" loading="lazy" decoding="async" /><figcaption>pie</figcaption></figure><p>texto</p>\n</div>\n',
    );
    expect(convert('::: izq ![](a.png)\ntexto\n:::').html).toContain('side-left');
  });

  it('a side block without a figcaption when the caption is empty, and at 40 % by default', () => {
    const html = convert('::: izq ![](a.png)\ntexto\n:::').html;
    expect(html).toContain('style="width:40%"');
    expect(html).not.toContain('figcaption');
  });

  it('a side block never closed is an error, and what follows goes inside it', () => {
    const r = convert('::: izq ![](a.png)\ntexto');
    expect(r.errors).toEqual(['Bloque «:::» sin su cierre «:::»: «::: izq ![](a.png)»']);
    expect(r.html).toContain('<p>texto</p>');
  });

  it('a «:::» with no image after it is not recognized', () => {
    expect(convert(':::\nx').errors).toEqual([
      'Bloque «:::» que no se reconoce (le falta su imagen): «:::»',
    ]);
  });

  it('an image in the middle of a line is not recognized, and neither is a raw img tag', () => {
    expect(convert('algo ![x](a.png) junto').errors).toEqual([
      'Figura que no se reconoce: «algo ![x](a.png) junto»',
    ]);
    expect(convert('<img src="x.png">').errors).toEqual([
      'Figura que no se reconoce: «<img src="x.png">»',
    ]);
  });

  it('a line that is too long to quote is cut at 140 characters', () => {
    const long = `${'x'.repeat(150)} ![a](a.png) y`;
    const message = convert(long).errors[0]!;
    expect(message).toBe(`Figura que no se reconoce: «${'x'.repeat(140)}…»`);
    const exact = `${'y'.repeat(120)} ![a](a.png) ${'z'.repeat(7)}`;
    expect(exact.length).toBe(140);
    expect(convert(exact).errors[0]).toContain(exact);
  });

  it('a lone image that cannot be found is an error and shows a placeholder', () => {
    const r = convertNote('![x](missing.png)', () => null);
    expect(r.errors).toEqual(['Imagen no encontrada: missing.png']);
    expect(r.html).toContain('imagen no encontrada');
  });

  it('two or more images alone on a line are a row, each as wide as the row gives it, whatever width they ask', () => {
    const html = convert('![a](a.png){20%} ![b](b.png)').html;
    expect(html).toMatch(
      /^<div class="figure-row"><figure class="figure"><img data-media="k\/a.png"/,
    );
    expect(html).not.toContain('style=');
  });

  it('an image with no known size has no width or height', () => {
    expect(convertNote('![x](a.png)', () => ({ key: 'k' })).html).not.toContain('width=');
    expect(convertNote('![x](a.png)', () => ({ key: 'k', width: 5 })).html).not.toContain(
      'height=',
    );
  });

  it('the alt text is the caption without its formatting, escaped', () => {
    const html = convert('![Un **codón** < y "dos" & más](a.png)').html;
    expect(html).toContain('alt="Un codón &lt; y &quot;dos&quot; &amp; más"');
  });
});

describe('what is at the end of a line', () => {
  it('a source line stuck to the text before it becomes its own paragraph, and one at the start stays', () => {
    expect(convert('texto\n*(Fuente, p. 4)*').html).toBe(
      '<p>texto</p>\n<p class="source">(Fuente, p. 4)</p>\n',
    );
    expect(convert('*(Fuente, p. 4)*\nsiguiente').html).toBe(
      '<p><em>(Fuente, p. 4)</em>\nsiguiente</p>\n',
    );
  });

  it('a guide question in italics is a callout only if asked', () => {
    const md = '*a) Primera cosa*\n*B. b) segunda*';
    const asked = convertNote(md, resolver, { guideQuestions: true }).html;
    expect(asked).toContain('<span class="callout-tag">a)</span></p><p><em>Primera cosa</em></p>');
    expect(asked).toContain('<span class="callout-tag">B. b)</span>');
    expect(convert(md).html).not.toContain('callout');
  });
});

describe('the summary and the sections', () => {
  it('«Resumen» is wrapped up to the next level-2 heading, and what follows stays outside', () => {
    const html = convert('antes\n\n## Resumen\nuno\n\n## Otro\ndos').html;
    expect(html).toBe(
      '<p>antes</p>\n<section class="note-summary"><h2 id="resumen">Resumen</h2>\n<p>uno</p>\n</section><h2 id="otro">Otro</h2>\n<p>dos</p>\n',
    );
  });

  it('a summary that is the last section wraps up to the end', () => {
    expect(convert('## Resumen\nuno').html).toBe(
      '<section class="note-summary"><h2 id="resumen">Resumen</h2>\n<p>uno</p>\n</section>',
    );
  });

  it('the text before the first heading belongs to the note’s own title; an empty section has no entry', () => {
    const r = convert('# T\n\nintro\n\n## S\ntexto\n\n## Vacía\n\n### Sub\n\nmás');
    expect(r.sections).toEqual([
      { anchor: '', title: 'T', level: 1, text: 'intro' },
      { anchor: 's', title: 'S', level: 2, text: 'texto' },
      { anchor: 'sub', title: 'Sub', level: 3, text: 'más' },
    ]);
  });

  it('a note with no title and no headings is one section with an empty title', () => {
    expect(convert('solo texto').sections).toEqual([
      { anchor: '', title: '', level: 1, text: 'solo texto' },
    ]);
  });

  it('a note with no text has no sections', () => {
    expect(convert('').sections).toEqual([]);
  });
});

describe('the same heading twice', () => {
  it('the second one gets «-2», the third «-3», in the page and in the table of contents', () => {
    const r = convert('## Núcleo\n\na\n\n## Núcleo\n\nb\n\n### Núcleo\n\nc');
    expect(r.toc.map((t) => t.anchor)).toEqual(['nucleo', 'nucleo-2', 'nucleo-3']);
    expect(r.sections.map((s) => s.anchor)).toEqual(['nucleo', 'nucleo-2', 'nucleo-3']);
    expect(r.html).toContain('<h2 id="nucleo-2">');
  });
});
