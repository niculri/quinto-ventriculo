/**
 * The charts of the `pauta-a-test` skill (histogram, box plot, scatter, bars, lines), drawn to SVG when
 * importing, exactly as its page draws them (`FIG` in plantilla/test.html): to scale, with the colors of the
 * page (`var(--g1)`, `var(--ink)`…) so they follow light and dark.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the skill's chart specs are free-form JSON */
type Spec = Record<string, any>;

const f1 = (v: number) => (+v).toFixed(1);
const fmt = (v: number) => String(+(+v).toFixed(6)).replace('.', ',');
const COL = (c: unknown) => (typeof c === 'number' ? `var(--g${c})` : (c as string) || 'var(--g1)');
const TX = 'fill="var(--mute)" font-family="var(--fbody)" font-size="11"';

export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}

function steps(a: number, b: number, p: number): number[] {
  const r: number[] = [];
  if (!(p > 0)) return r;
  for (let i = 0; i < 500; i++) {
    const v = a + i * p;
    if (v > b + 1e-9) break;
    r.push(+v.toFixed(8));
  }
  return r;
}
const svgStart = (W: number, H: number, label: string) =>
  `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(label)}">`;
const svgTitle = (x: number, t: string) =>
  `<text x="${f1(x)}" y="14" text-anchor="middle" fill="var(--ink)" font-family="var(--fdisp)" font-size="12.5" font-weight="600">${esc(t)}</text>`;
type Margin = { l: number; r: number; t: number; b: number };
function axisLabels(m: Margin, iw: number, ih: number, H: number, xr?: string, yr?: string) {
  let g = '';
  if (xr)
    g += `<text x="${f1(m.l + iw / 2)}" y="${H - 5}" text-anchor="middle" ${TX}>${esc(xr)}</text>`;
  if (yr)
    g += `<text transform="translate(13,${f1(m.t + ih / 2)}) rotate(-90)" text-anchor="middle" ${TX}>${esc(yr)}</text>`;
  return g;
}
const gridY = (m: Margin, iw: number, y: number, v: number) =>
  `<line x1="${m.l}" y1="${f1(y)}" x2="${m.l + iw}" y2="${f1(y)}" stroke="var(--line2)"/><text x="${m.l - 7}" y="${f1(y + 4)}" text-anchor="end" ${TX}>${fmt(v)}</text>`;
const tickX = (x: number, y: number, v: number) =>
  `<line x1="${f1(x)}" y1="${y}" x2="${f1(x)}" y2="${y + 4}" stroke="var(--line)"/><text x="${f1(x)}" y="${y + 16}" text-anchor="middle" ${TX}>${fmt(v)}</text>`;
const axisX = (m: Margin, iw: number, ih: number) =>
  `<line x1="${m.l}" y1="${m.t + ih}" x2="${m.l + iw}" y2="${m.t + ih}" stroke="var(--line)" stroke-width="1.2"/>`;

const CHARTS: Record<string, (s: Spec) => string> = {
  histograma(s) {
    const W = s.ancho || 306,
      H = s.alto || 232,
      m = { l: 44, r: 12, t: s.titulo ? 28 : 14, b: 42 },
      iw = W - m.l - m.r,
      ih = H - m.t - m.b;
    const [x0, x1] = s.x as [number, number];
    const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw;
    const sy = (v: number) => m.t + ih - (Math.min(v, s.y_max) / s.y_max) * ih;
    let g = svgStart(W, H, s.etiqueta || s.titulo || 'Histograma');
    if (s.titulo) g += svgTitle(m.l + iw / 2, s.titulo);
    steps(0, s.y_max, s.y_paso).forEach((v) => (g += gridY(m, iw, sy(v), v)));
    (s.barras as [number, number, number][]).forEach(([a, b, f]) => {
      const x = sx(a),
        w = sx(b) - sx(a),
        y = sy(f);
      g += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(m.t + ih - y)}" fill="${COL(s.color)}" stroke="var(--surf)" stroke-width="1"/>`;
    });
    g += axisX(m, iw, ih);
    ((s.x_marcas as number[]) || steps(x0, x1, s.x_paso)).forEach(
      (t) => (g += tickX(sx(t), m.t + ih, t)),
    );
    return g + axisLabels(m, iw, ih, H, s.x_rotulo, s.y_rotulo) + '</svg>';
  },
  cajas(s) {
    const W = s.ancho || 330,
      H = s.alto || 280,
      m = { l: 52, r: 14, t: s.titulo ? 28 : 14, b: 44 },
      iw = W - m.l - m.r,
      ih = H - m.t - m.b;
    const [y0, y1] = s.y as [number, number];
    const sy = (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih,
      step = iw / s.grupos.length;
    let g = svgStart(W, H, s.etiqueta || s.titulo || 'Diagrama de cajas');
    if (s.titulo) g += svgTitle(m.l + iw / 2, s.titulo);
    ((s.y_marcas as number[]) || steps(y0, y1, s.y_paso)).forEach(
      (v) => (g += gridY(m, iw, sy(v), v)),
    );
    (s.grupos as Spec[]).forEach((q, i) => {
      const cx = m.l + step * (i + 0.5),
        bw = Math.min(step * 0.42, 80),
        c = COL(q.color ?? s.color);
      g += `<line x1="${f1(cx)}" y1="${f1(sy(q.min))}" x2="${f1(cx)}" y2="${f1(sy(q.max))}" stroke="var(--ink2)" stroke-dasharray="4 3"/>`;
      [q.min, q.max].forEach(
        (v: number) =>
          (g += `<line x1="${f1(cx - bw * 0.34)}" y1="${f1(sy(v))}" x2="${f1(cx + bw * 0.34)}" y2="${f1(sy(v))}" stroke="var(--ink2)"/>`),
      );
      g += `<rect x="${f1(cx - bw / 2)}" y="${f1(sy(q.q3))}" width="${f1(bw)}" height="${f1(sy(q.q1) - sy(q.q3))}" fill="${c}" stroke="var(--ink)" stroke-width="1"/>`;
      g += `<line x1="${f1(cx - bw / 2)}" y1="${f1(sy(q.med))}" x2="${f1(cx + bw / 2)}" y2="${f1(sy(q.med))}" stroke="var(--ink)" stroke-width="2.4"/>`;
      ((q.atipicos as number[]) || []).forEach(
        (v) =>
          (g += `<circle cx="${f1(cx)}" cy="${f1(sy(v))}" r="3" fill="none" stroke="var(--ink2)" stroke-width="1.2"/>`),
      );
      g += `<text x="${f1(cx)}" y="${m.t + ih + 18}" text-anchor="middle" fill="var(--ink)" font-family="var(--fbody)" font-size="12" font-weight="600">${esc(q.nombre)}</text>`;
    });
    g += axisX(m, iw, ih);
    return g + axisLabels(m, iw, ih, H, s.x_rotulo, s.y_rotulo) + '</svg>';
  },
  dispersion(s) {
    const W = s.ancho || 286,
      H = s.alto || 236,
      m = { l: 46, r: 12, t: s.titulo ? 28 : 14, b: 42 },
      iw = W - m.l - m.r,
      ih = H - m.t - m.b;
    const [x0, x1] = s.x as [number, number],
      [y0, y1] = s.y as [number, number];
    const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw,
      sy = (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    let g = svgStart(W, H, s.etiqueta || s.titulo || 'Gráfico de dispersión');
    if (s.titulo) g += svgTitle(m.l + iw / 2, s.titulo);
    g += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="none" stroke="var(--line)"/>`;
    ((s.y_marcas as number[]) || steps(y0, y1, s.y_paso)).forEach(
      (t) =>
        (g += `<line x1="${m.l - 4}" y1="${f1(sy(t))}" x2="${m.l}" y2="${f1(sy(t))}" stroke="var(--line)"/><text x="${m.l - 7}" y="${f1(sy(t) + 4)}" text-anchor="end" ${TX}>${fmt(t)}</text>`),
    );
    ((s.x_marcas as number[]) || steps(x0, x1, s.x_paso)).forEach(
      (t) => (g += tickX(sx(t), m.t + ih, t)),
    );
    if (s.tendencia) {
      const [[a, b], [c, d]] = s.tendencia as [[number, number], [number, number]];
      g += `<line x1="${f1(sx(a))}" y1="${f1(sy(b))}" x2="${f1(sx(c))}" y2="${f1(sy(d))}" stroke="var(--ink2)" stroke-width="1.4" stroke-dasharray="5 4"/>`;
    }
    (s.puntos as [number, number][]).forEach(
      (p) =>
        (g += `<circle cx="${f1(sx(p[0]))}" cy="${f1(sy(p[1]))}" r="${s.radio || 2.3}" fill="${COL(s.color)}"/>`),
    );
    return g + axisLabels(m, iw, ih, H, s.x_rotulo, s.y_rotulo) + '</svg>';
  },
  barras(s) {
    const W = s.ancho || 330,
      H = s.alto || 250,
      m = { l: 48, r: 14, t: s.titulo ? 30 : 16, b: 44 },
      iw = W - m.l - m.r,
      ih = H - m.t - m.b;
    const sy = (v: number) => m.t + ih - (Math.min(v, s.y_max) / s.y_max) * ih,
      step = iw / s.categorias.length;
    let g = svgStart(W, H, s.etiqueta || s.titulo || 'Gráfico de barras');
    if (s.titulo) g += svgTitle(m.l + iw / 2, s.titulo);
    steps(0, s.y_max, s.y_paso).forEach((v) => (g += gridY(m, iw, sy(v), v)));
    (s.categorias as string[]).forEach((c, i) => {
      const bw = step * 0.62,
        x = m.l + step * i + (step - bw) / 2,
        v = s.valores[i] as number,
        y = sy(v);
      g += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${f1(m.t + ih - y)}" fill="${COL(s.color)}" rx="1.5"/>`;
      if (s.valores_visibles !== false)
        g += `<text x="${f1(x + bw / 2)}" y="${f1(y - 4)}" text-anchor="middle" fill="var(--ink2)" font-family="var(--fmono)" font-size="10.5" font-weight="600">${fmt(v)}</text>`;
      g += `<text x="${f1(x + bw / 2)}" y="${m.t + ih + 16}" text-anchor="middle" ${TX}>${esc(c)}</text>`;
    });
    g += axisX(m, iw, ih);
    return g + axisLabels(m, iw, ih, H, s.x_rotulo, s.y_rotulo) + '</svg>';
  },
  lineas(s) {
    const legend = s.series.length > 1,
      W = s.ancho || 330,
      H = s.alto || 240,
      m = { l: 48, r: 14, t: (s.titulo ? 30 : 16) + (legend ? 18 : 0), b: 42 },
      iw = W - m.l - m.r,
      ih = H - m.t - m.b;
    const [x0, x1] = s.x as [number, number],
      [y0, y1] = s.y as [number, number];
    const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw,
      sy = (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    let g = svgStart(W, H, s.etiqueta || s.titulo || 'Gráfico de líneas');
    if (s.titulo) g += svgTitle(m.l + iw / 2, s.titulo);
    ((s.y_marcas as number[]) || steps(y0, y1, s.y_paso)).forEach(
      (v) => (g += gridY(m, iw, sy(v), v)),
    );
    g += axisX(m, iw, ih);
    ((s.x_marcas as number[]) || steps(x0, x1, s.x_paso)).forEach(
      (t) => (g += tickX(sx(t), m.t + ih, t)),
    );
    (s.series as Spec[]).forEach((se, k) => {
      const c = COL(se.color ?? k + 1),
        P = se.puntos as [number, number][];
      const d = s.escalonada
        ? P.map(([x, y], i) =>
            i ? `H${f1(sx(x))}V${f1(sy(y))}` : `M${f1(sx(x))} ${f1(sy(y))}`,
          ).join('')
        : P.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(sx(x))} ${f1(sy(y))}`).join('');
      g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2"${se.discontinua ? ' stroke-dasharray="6 4"' : ''}/>`;
      if (s.marcadores)
        P.forEach(
          ([x, y]) => (g += `<circle cx="${f1(sx(x))}" cy="${f1(sy(y))}" r="2.8" fill="${c}"/>`),
        );
      if (legend) {
        const lx = m.l + k * Math.min(iw / s.series.length, 130),
          ly = s.titulo ? 30 : 12;
        g += `<line x1="${f1(lx)}" y1="${ly}" x2="${f1(lx + 16)}" y2="${ly}" stroke="${c}" stroke-width="2.4"${se.discontinua ? ' stroke-dasharray="6 4"' : ''}/><text x="${f1(lx + 21)}" y="${ly + 4}" fill="var(--ink2)" font-family="var(--fbody)" font-size="11.5">${esc(se.nombre || '')}</text>`;
      }
    });
    return g + axisLabels(m, iw, ih, H, s.x_rotulo, s.y_rotulo) + '</svg>';
  },
};

export const CHART_KINDS = Object.keys(CHARTS);

/** The chart as SVG; throws if its data are not numbers (the page shows «No se pudo dibujar…»). */
export function drawChart(spec: Spec): string {
  const draw = CHARTS[spec.tipo as string];
  if (!draw) throw new Error(`tipo de gráfico desconocido: ${spec.tipo}`);
  const svg = draw(spec);
  if (/NaN|undefined/.test(svg)) throw new Error('hay valores que no son números');
  return svg;
}
