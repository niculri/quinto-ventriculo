// What the tests of the taxonomy checks share: an article, the sample deck, a test, and a tree with its map and manifest.
import { copyFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TaxonomyFile, TopicMapFile } from '@qv/schema';
import type { Manifest } from '../manifest/schemas';

export const A = 'anatomia-1/certamen-1';
export const QUIZ = 'anatomia-1-certamen-1-practica';
const SAMPLE = join(import.meta.dirname, '../../../anki-format/test/fixtures/sample.apkg');

/** The folder the manifest's files are in. */
export async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qv-taxonomy-'));
  await mkdir(join(root, 'clase'), { recursive: true });
  await writeFile(
    join(root, 'clase/articulo.md'),
    [
      '# Semana de prueba',
      '',
      '## 1. Vértebras',
      '',
      'Texto.',
      '',
      '## 2. Ligamentos',
      '',
      'Texto.',
      '',
      '### 2.1. Ligamento amarillo',
      '',
      'Texto.',
      '',
      '## 3. Imagen',
      '',
      'Texto.',
      '',
      '## 4. Sin ítems',
      '',
      'Texto.',
      '',
      '## Resumen',
      '',
      'Texto.',
      '',
    ].join('\n'),
  );
  await mkdir(join(root, 'mazos'), { recursive: true });
  await copyFile(SAMPLE, join(root, 'mazos/Mazo de prueba.apkg'));
  const t = join(root, 'Test - Práctica');
  await mkdir(join(t, 'preguntas'), { recursive: true });
  await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Práctica' }));
  await writeFile(
    join(t, 'preguntas', '01.json'),
    JSON.stringify({
      nombre: 'Columna',
      preguntas: [
        { q: '¿Cuántas?', o: ['7', '12'], ok: 'A', nota: '[P-1] …' },
        { q: '¿Cuál une las láminas?', o: ['Amarillo', 'Nucal'], ok: 'A', nota: '[P-2] …' },
      ],
    }),
  );
  await writeFile(
    join(t, 'preguntas', '02.json'),
    JSON.stringify({
      nombre: 'Extras',
      preguntas: [{ q: 'Corta', r: 'La respuesta', nota: '[P-3] …' }],
    }),
  );
  return root;
}

export const tree = (): TaxonomyFile => ({
  assessmentId: A,
  version: 1,
  nextTopic: 8,
  units: [
    {
      id: 's1',
      title: 'Semana de prueba',
      // Its deck («Mazo de prueba») and its group (01) come from the article's «Ponte a prueba».
      notes: ['AP-PR-S1-01'],
      topics: [
        { id: 't1', title: 'Vértebras', section: '1-vertebras' },
        { id: 't2', title: 'Ligamentos', section: '2-ligamentos' },
        { id: 't3', title: 'Imagen', section: '3-imagen' },
        { id: 't6', title: 'Un tema viejo', retired: true },
        { id: 't7', title: 'Cuerpo vertebral', mergedInto: 't1' },
      ],
    },
    {
      id: 'extras',
      title: 'Extras de la semana',
      // The closest deck wins: the Extras cards are of this unit, not of s1.
      decks: ['Extras'],
      quizGroups: [`${QUIZ}/all/02`],
      topics: [
        { id: 't4', title: 'Extra básico' },
        { id: 't5', title: 'Extra cloze' },
      ],
    },
  ],
});

export const topicMap = (): TopicMapFile => ({
  assessmentId: A,
  taxonomyVersion: 1,
  notes: [
    { guid: 'Or&8~[!Z2<', code: 'T-PR-01-001', topic: 't1' },
    { guid: 's@/AqX%n?#', code: 'T-PR-01-002', topic: 't2' },
    { guid: 'cloze-1', topic: 't2' },
    { guid: 'oclusion-1', topic: 't3', ords: { '4': 't1' } },
    { guid: 'extra-basica-1', topic: 't4' },
    { guid: 'cloze-anidado', topic: 't5' },
    { guid: 'oclusion-2', topic: 't4' },
  ],
  questions: [
    { id: `${QUIZ}/P-1`, topic: 't1' },
    { id: `${QUIZ}/P-2`, topic: 't2', secondary: ['t3', 't4'] },
    { id: `${QUIZ}/P-3`, topic: 't4' },
  ],
});

export const manifest = (
  edit: (t: { taxonomy: TaxonomyFile; map: TopicMapFile }) => void = () => {},
  withTaxonomy = true,
): Manifest => {
  const t = { taxonomy: tree(), map: topicMap() };
  edit(t);
  return {
    catalog: {
      semesters: [{ number: 1, name: '1° Semestre' }],
      courses: [{ id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 }],
      assessments: [{ id: A, courseId: 'anatomia-1', name: 'Certamen 1', position: 1 }],
    },
    notes: [
      {
        assessmentId: A,
        notes: [
          {
            id: 'AP-PR-S1-01',
            slug: 's1-semana-de-prueba',
            kind: 'lecture',
            position: 1,
            title: 'Semana de prueba',
            sources: [],
            practice: { quizId: QUIZ, groups: ['01'], deck: 'Mazo de prueba' },
            sourceFile: 'clase/articulo.md',
          },
        ],
      },
    ],
    decks: [{ assessmentId: A, decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] }],
    tests: [
      {
        assessmentId: A,
        tests: [{ slug: 'practica', position: 1, folder: 'Test - Práctica', title: 'Práctica' }],
      },
    ],
    unpublished: [],
    taxonomies: withTaxonomy ? [{ assessmentId: A, ...t }] : [],
  };
};
