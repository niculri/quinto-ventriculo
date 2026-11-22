// The SQL helpers of the content database that no test named: what they keep, drop and normalise, one rule each.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../pglite';
import { queriesOn } from '../helpers/queries';

let db: PGlite;
const { q } = queriesOn(() => db);
const one = async <T>(sql: string, params: unknown[] = []) =>
  ((await q<{ v: T }>(`select ${sql} as v`, params))[0] as { v: T }).v;

beforeAll(async () => {
  db = await createDatabase('content');
});

describe('anki_plain_text', () => {
  it('turns tags into spaces, decodes the entities once and collapses the white space', async () => {
    expect(await one('anki_plain_text($1)', ['<b>Hola</b>&nbsp;<i>mundo</i>\n  fin'])).toBe(
      'Hola mundo fin',
    );
    expect(await one('anki_plain_text($1)', ['&lt;b&gt; &quot;x&quot; &#39;y&#39; &amp; z'])).toBe(
      `<b> "x" 'y' & z`,
    );
  });

  it('a tag and a non-breaking space separate the words they sit between, with nothing else around them', async () => {
    expect(await one('anki_plain_text($1)', ['uno<b>dos</b>tres'])).toBe('uno dos tres');
    expect(await one('anki_plain_text($1)', ['uno&nbsp;dos'])).toBe('uno dos');
  });

  it('decodes &amp; last, so an escaped entity stays escaped', async () => {
    expect(await one('anki_plain_text($1)', ['&amp;lt;'])).toBe('&lt;');
  });

  it('nothing is an empty text, not null', async () => {
    expect(await one('anki_plain_text(null)')).toBe('');
  });
});

describe('query_to_tsquery', () => {
  const asText = (query: string | null) => one<string>('query_to_tsquery($1)::text', [query]);

  it('every word is a prefix and all must match, ignoring accents', async () => {
    const both = await asText('núcleo cel');
    expect(both.split(' & ')).toHaveLength(2);
    expect(both.split(' & ').every((term) => term.endsWith(':*'))).toBe(true);
    expect(await asText('núcleo')).toBe(await asText('nucleo'));
  });

  it('what is not a letter, a digit or a hyphen is a separator, so a query cannot write tsquery syntax', async () => {
    expect(await asText("a&b | !c (d) e:f 'g'")).toBe(await asText('a b c d e f g'));
  });

  it('keeps a hyphenated word as one compound and drops a word made only of hyphens', async () => {
    const compound = await asText('beta-celula');
    expect(compound).toContain(' <-> ');
    expect(await asText('beta-celula ---')).toBe(compound);
    expect(await asText('---')).toBe('');
  });

  it('an empty, blank or missing query is the empty tsquery', async () => {
    expect(await asText('')).toBe('');
    expect(await asText('   ')).toBe('');
    expect(await asText(null)).toBe('');
  });

  it('only the first 200 characters are read', async () => {
    const query = `${'x'.repeat(199)} tail`;
    expect((await asText(query)).split(' & ')).toHaveLength(1);
    expect((await asText(`${'x'.repeat(198)} tail`)).split(' & ')).toHaveLength(2);
  });
});

describe('release_neutral_fields', () => {
  it('an occlusion is its image: only the extra, the comments and the codes do not change the question', async () => {
    expect(await one('release_neutral_fields(true)')).toEqual([
      'Reverso extra',
      'Comentarios',
      'Código',
      'Creación',
      'Actualización',
    ]);
  });

  it('any other note also lets its image, theme and source change without being a new question', async () => {
    expect(await one('release_neutral_fields(false)')).toEqual([
      'Extra',
      'Imagen',
      'Tema',
      'Fuente',
      'Código',
      'Creación',
      'Actualización',
    ]);
  });
});

describe('release_cloze_signature', () => {
  const signature = (fields: Record<string, string>, occlusion = false) =>
    one<Record<string, string>>('release_cloze_signature($1::jsonb, $2)', [
      JSON.stringify(fields),
      occlusion,
    ]);

  it('maps each hole to what it hides, numbering from 0 and dropping its hint', async () => {
    expect(await signature({ Texto: '{{c1::<b>núcleo</b>::pista}} y {{c2::ADN}}' })).toEqual({
      '0': 'núcleo',
      '1': 'ADN',
    });
  });

  it('two holes with the same number are one hole, its parts in alphabetical order', async () => {
    expect(await signature({ Texto: '{{c1::beta}} {{c1::alfa}}' })).toEqual({ '0': 'alfa;beta' });
  });

  it('reads every field of the note, and ignores numbers outside 1 to 10000', async () => {
    expect(
      await signature({ A: '{{c1::uno}}', B: '{{c2::dos}} {{c0::cero}} {{c10001::mucho}}' }),
    ).toEqual({ '0': 'uno', '1': 'dos' });
  });

  it('in an occlusion only the image-occlusion holes count, without the id of their image', async () => {
    expect(
      await signature(
        {
          Máscaras:
            '{{c1::image-occlusion:rect:left=.1:top=.2:oi=1}} {{c2::image-occlusion:rect:left=.5:oi=2}}',
        },
        true,
      ),
    ).toEqual({ '0': 'rect:left=.1:top=.2', '1': 'rect:left=.5' });
    expect(await signature({ Máscaras: '{{c1::texto}}' }, true)).toEqual({});
  });

  it('a note with no fields has no holes', async () => {
    expect(await one('release_cloze_signature(null, false)')).toEqual({});
  });
});

describe('release_json_text', () => {
  it('joins the scalars of a document, skipping objects, arrays and nulls', async () => {
    const text = await one<string>('release_json_text($1::jsonb)', [
      JSON.stringify({ a: ['uno', 2, null, true], b: { c: '<i>tres</i>' } }),
    ]);
    expect(text.split(' | ').sort()).toEqual(['2', 'tres', 'true', 'uno']);
  });

  it('no document is no text', async () => {
    expect(await one('release_json_text(null)')).toBe('');
    expect(await one(`release_json_text('{}'::jsonb)`)).toBe('');
  });
});

describe('release_digest_shift', () => {
  it('adds what a change brings and takes away what it removes, in the one table it names', async () => {
    const shifted = await one<Record<string, number[]>>(
      'release_digest_shift($1::jsonb, $2, $3::jsonb, $4::jsonb)',
      [
        JSON.stringify({ anki_notes: [10, 100], quiz_questions: [1, 1] }),
        'anki_notes',
        '[2, 5]',
        '[1, 7]',
      ],
    );
    expect(shifted).toEqual({ anki_notes: [11, 98], quiz_questions: [1, 1] });
  });
});
