// What the importer's tests share: a manifest of two notes, the folder with their files and the sample deck.
import { copyFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Manifest } from '../manifest/schemas';
import { privateMaterial } from '../privateFolder';

export const PRIVATE = privateMaterial();
export const privately = (name: string) =>
  PRIVATE.content ? name : `${name} (se salta: ${PRIVATE.skipReason})`;

export const manifest: Manifest = {
  catalog: {
    semesters: [
      { number: 1, name: '1° Semestre' },
      { number: 2, name: '2° Semestre' },
    ],
    courses: [
      { id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 },
      { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
    ],
    assessments: [
      { id: 'anatomia-1/certamen-1', courseId: 'anatomia-1', name: 'Certamen 1', position: 1 },
      {
        id: 'biologia-celular/certamen-2',
        courseId: 'biologia-celular',
        name: 'Certamen 2',
        position: 2,
      },
    ],
  },
  notes: [
    {
      assessmentId: 'biologia-celular/certamen-2',
      notes: [
        {
          id: 'AP-BC-C2-11',
          code: 'QV-BC-C2-11',
          slug: '11-traduccion',
          kind: 'lecture',
          position: 1,
          title: 'Traducción',
          subtitle: 'Clase N.º 11',
          header: { number: '11', lecturer: 'Prof. Luis Ejemplo A.', term: 'spring', year: 2026 },
          sources: ['Fuentes: diapositivas'],
          practice: { deck: '11 - Traducción' },
          sourceFile: 'clase/apunte.md',
        },
        {
          id: 'AP-BC-C2-12',
          slug: '12-comunicacion',
          kind: 'lecture',
          position: 2,
          title: 'Comunicación',
          sources: [],
          sourceFile: 'otra/apunte.md',
        },
      ],
    },
  ],
  decks: [],
};

/** Two assessments: the article of the first one and another of the second, with the sample deck in the second. */
export const twoAssessments: Manifest = {
  ...structuredClone(manifest),
  notes: [
    structuredClone(manifest.notes[0]!),
    {
      assessmentId: 'anatomia-1/certamen-1',
      notes: [
        {
          id: 'AP-A1-S3-01',
          slug: '01-columna',
          kind: 'lecture',
          position: 1,
          title: 'Columna',
          sources: [],
          sourceFile: 'otra/apunte.md',
        },
      ],
    },
  ],
  decks: [
    { assessmentId: 'anatomia-1/certamen-1', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] },
  ],
};

const SAMPLE = join(import.meta.dirname, '../../../anki-format/test/fixtures/sample.apkg');

/** The folder `manifest`'s files are in: two articles, an image, the sample deck. */
export async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qv-importer-'));
  await mkdir(join(root, 'clase/imagenes'), { recursive: true });
  await mkdir(join(root, 'otra/img'), { recursive: true });
  await mkdir(join(root, 'mala'), { recursive: true });
  await mkdir(join(root, 'sem'), { recursive: true });
  const png = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: '#4a7890' },
  })
    .png()
    .toBuffer();
  await writeFile(join(root, 'clase/imagenes/ribosoma.png'), png);
  await writeFile(join(root, 'otra/img/misma.png'), png);
  await writeFile(
    join(root, 'clase/apunte.md'),
    '# Traducción\n<!-- creado: 2026-09-30 -->\n\n## Ribosomas\n\n![Ribosoma](imagenes/ribosoma.png){50%}\n',
  );
  await writeFile(join(root, 'otra/apunte.md'), '# Comunicación\n\n![Igual](img/misma.png)\n');
  await mkdir(join(root, 'mazos'), { recursive: true });
  await copyFile(SAMPLE, join(root, 'mazos/Mazo de prueba.apkg'));
  return root;
}
