// Turns the sections of a test.json into the published ones, with the descriptions and notices the skill's page uses.
import type { ImportedQuiz, QuizListing } from '@qv/schema';
import type { QuizState } from './figures';
import { inlineHtml, orFallback, textOk } from './inline';
import { convertGroups } from './questions';
import type { ParsedGroup, ParsedTest, Section } from './schema';

const DESCRIPTION =
  'Las **{n} preguntas**, con su texto textual y sus alternativas. Eliges una, te dice al instante si ' +
  'está bien o mal, y al terminar muestra cuántas buenas y cuántas malas.';
const DESCRIPTION_OPEN =
  'Las **{n} preguntas**, con su texto textual. En las de alternativas te dice al instante si está ' +
  'bien o mal; en las de respuesta corta ves la respuesta y marcas si la sabías. Al terminar ' +
  'muestra cuántas buenas y cuántas malas.';

function describe(text: unknown, list: ParsedGroup[]): string {
  const total = list.reduce((t, g) => t + g.questions.length, 0);
  const open = list.some((g) => g.questions.some((q) => q.o === undefined));
  return inlineHtml(
    (textOk(text) ? text : open ? DESCRIPTION_OPEN : DESCRIPTION).replaceAll('{n}', String(total)),
  );
}

function convertListing(s: Section | null): QuizListing | undefined {
  if (!s?.listado) return undefined;
  return {
    title: inlineHtml(orFallback(s.listado.titulo, 'Listado')),
    items: s.listado.items.map((x) =>
      typeof x === 'string'
        ? inlineHtml(x)
        : { title: inlineHtml(x.titulo), items: x.items.map(inlineHtml) },
    ),
  };
}

interface SectionPlace {
  id: string;
  s: Section | null;
  list: ParsedGroup[];
}

function placesOf(test: ParsedTest): SectionPlace[] {
  if (!test.sections) return [{ id: 'all', s: null, list: test.groups }];
  return test.sections.map(({ id, section }) => ({
    id,
    s: section,
    list: test.groups.filter((g) => g.section === id),
  }));
}

/** One section as it is published: its own texts, else the test's, and its groups converted. */
async function convertSection(
  state: QuizState,
  test: ParsedTest,
  place: SectionPlace,
  position: number,
): Promise<ImportedQuiz['sections'][number]> {
  const { cfg } = test;
  const { id, s, list } = place;
  const converted = await convertGroups(state, list, position > 0 ? id : undefined);
  const all = converted.flatMap((g) => g.questions);
  // An empty section notice means none; a missing one falls back to the test's.
  const general = textOk(cfg.aviso) ? inlineHtml(cfg.aviso) : undefined;
  const notice = s && 'aviso' in s ? (textOk(s.aviso) ? inlineHtml(s.aviso) : undefined) : general;
  const listing = convertListing(s);
  const groupsTitle = textOk(s?.grupos_titulo)
    ? s.grupos_titulo
    : textOk(cfg.grupos_titulo)
      ? cfg.grupos_titulo
      : 'Qué ensayar';
  return {
    id,
    name: s ? inlineHtml(s.nombre) : '',
    ...(s?.etiqueta ? { label: inlineHtml(s.etiqueta) } : {}),
    description: describe(orFallback(s?.descripcion, cfg.descripcion), list),
    ...(notice ? { notice } : {}),
    groupsTitle,
    ...(listing ? { listing } : {}),
    questionCount: all.length,
    hasChoices: all.some((q) => q.kind === 'choice'),
    groups: converted,
  };
}

export async function convertSections(
  state: QuizState,
  test: ParsedTest,
): Promise<ImportedQuiz['sections']> {
  const sections: ImportedQuiz['sections'] = [];
  for (const [k, place] of placesOf(test).entries()) {
    sections.push(await convertSection(state, test, place, k));
  }
  return sections;
}
