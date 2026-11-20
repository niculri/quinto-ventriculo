// The test note: an article of Biología celular with two headings, a figure and an unsafe image.
import type { Note } from '@qv/schema';
import { CATALOG } from './catalog';

export const NOTE: Note = {
  ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.notes[1]!,
  sources: ['Clase 11, «Traducción», semestre de primavera 2026: diapositivas y grabación.'],
  code: 'QV-BC-C2-11',
  version: 2,
  publishedAt: '2026-11-01T12:00:00.000Z',
  versionAt: '2026-11-03T12:00:00.000Z',
  header: {
    number: '11',
    lecturer: 'Prof. Luis Ejemplo A.',
    institution: 'ICBM, Universidad de Chile',
    term: 'spring',
    year: 2026,
  },
  practice: { quizId: 'practica-biocel', section: 'pautas', groups: ['02'] },
  html:
    '<h2 id="ribosomas">Ribosomas</h2><p>Dos subunidades.</p><img src="x" onerror="alert(1)">' +
    '<figure class="figure"><img src="/api/media/a.webp" alt="Ribosoma"><figcaption>El ribosoma</figcaption></figure>' +
    '<h3 id="sitios">Sitios A, P y E</h3><p>Texto.</p>',
  toc: [
    { anchor: 'ribosomas', title: 'Ribosomas', level: 2 },
    { anchor: 'sitios', title: 'Sitios A, P y E', level: 3 },
  ],
};
