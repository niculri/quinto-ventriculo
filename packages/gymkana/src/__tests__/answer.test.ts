// The writing mode's checking: El Rincón de la Gymkana's cases, score by score, and the rules added here (the whole
// name, its parts, the generic words written, what a comma adds and the other stations).
import { describe, expect, it } from 'vitest';
import {
  CORRECT_SCORE,
  alternatives,
  checkAnswer,
  isCorrect,
  levenshtein,
  normalize,
} from '../answer';

/** [written, the station's name, El Rincón's score] */
const CASES: [string, string, number][] = [
  ['Músculo recto lateral', 'Músculo recto lateral', 1],
  ['musculo recto lateral', 'Músculo recto lateral', 1],
  ['MÚSCULO RECTO LATERAL', 'Músculo recto lateral', 1],
  ['recto lateral', 'Músculo recto lateral', 1],
  ['lateral recto', 'Músculo recto lateral', 1],
  ['m. recto lateral', 'Músculo recto lateral', 1],
  ['m recto lateral', 'Músculo recto lateral', 1],
  ['M.recto lateral', 'Músculo recto lateral', 1],
  ['recto lateal', 'Músculo recto lateral', 0.95],
  ['rrecto lateral', 'Músculo recto lateral', 0.95],
  ['recto medial', 'Músculo recto lateral', 0],
  ['recto', 'Músculo recto lateral', 0],
  ['músculo recto', 'Músculo recto lateral', 0],
  ['arteria recto lateral', 'Músculo recto lateral', 0],
  ['recto lateral superior', 'Músculo recto lateral', 0],
  ['', 'Músculo recto lateral', 0],
  ['   ', 'Músculo recto lateral', 0],
  ['Arteria carótida interna', 'Arteria carótida interna', 1],
  ['carotida interna', 'Arteria carótida interna', 1],
  ['a. carótida interna', 'Arteria carótida interna', 1],
  ['a carotida interna', 'Arteria carótida interna', 1],
  ['carótida externa', 'Arteria carótida interna', 0],
  ['arteria carótida externa', 'Arteria carótida interna', 0],
  ['carotida internaa', 'Arteria carótida interna', 0.95],
  ['karotida interna', 'Arteria carótida interna', 0.95],
  ['vena carótida interna', 'Arteria carótida interna', 0],
  ['v. carótida interna', 'Arteria carótida interna', 0],
  ['carótida', 'Arteria carótida interna', 0],
  ['interna carótida', 'Arteria carótida interna', 1],
  ['Vena yugular interna', 'Vena yugular interna', 1],
  ['yugular interna', 'Vena yugular interna', 1],
  ['v. yugular interna', 'Vena yugular interna', 1],
  ['arteria yugular interna', 'Vena yugular interna', 0],
  ['yugular externa', 'Vena yugular interna', 0],
  ['yugular anterior', 'Vena yugular interna', 0],
  ['vena yugular', 'Vena yugular interna', 0],
  ['yugulr interna', 'Vena yugular interna', 0.95],
  ['Nervio facial', 'Nervio facial', 1],
  ['n. facial', 'Nervio facial', 1],
  ['n facial', 'Nervio facial', 1],
  ['facial', 'Nervio facial', 1],
  ['fascial', 'Nervio facial', 0.95],
  ['nervio facila', 'Nervio facial', 0],
  ['arteria facial', 'Nervio facial', 0],
  ['vena facial', 'Nervio facial', 0],
  ['Ligamento esfenomandibular', 'Ligamento esfenomandibular', 1],
  ['lig. esfenomandibular', 'Ligamento esfenomandibular', 1],
  ['esfenomandibular', 'Ligamento esfenomandibular', 1],
  ['esfenomandibualr', 'Ligamento esfenomandibular', 0.95],
  ['estilomandibular', 'Ligamento esfenomandibular', 0],
  ['Glándula parótida', 'Glándula parótida', 1],
  ['gl. parótida', 'Glándula parótida', 1],
  ['parotida', 'Glándula parótida', 1],
  ['parotyda', 'Glándula parótida', 0.95],
  ['glandula submandibular', 'Glándula parótida', 0],
  ['Músculo pterigoideo lateral', 'Músculo pterigoideo lateral', 1],
  ['pterigoideo lateral', 'Músculo pterigoideo lateral', 1],
  ['pterigoideo medial', 'Músculo pterigoideo lateral', 0],
  ['pterigoideo lateral superior', 'Músculo pterigoideo lateral', 0],
  ['pterigoideo', 'Músculo pterigoideo lateral', 0],
  ['ptérigoideo lateral', 'Músculo pterigoideo lateral', 1],
  ['pterygoideo lateral', 'Músculo pterigoideo lateral', 0.95],
  ['hueso cigomatico', 'Hueso cigomático (hueso malar)', 1],
  ['hueso malar', 'Hueso cigomático (hueso malar)', 1],
  ['malar', 'Hueso cigomático (hueso malar)', 1],
  ['hueso temporal', 'Hueso cigomático (hueso malar)', 0],
  ['hueso malar superior', 'Hueso cigomático (hueso malar)', 0],
  ['cigomatico hueso', 'Hueso cigomático (hueso malar)', 1],
  ['punto de Erb', 'Punto nervioso del cuello (punto de Erb)', 1],
  ['punto nervioso del cuello', 'Punto nervioso del cuello (punto de Erb)', 1],
  ['punto nervioso', 'Punto nervioso del cuello (punto de Erb)', 0],
  ['Notocorda', 'Notocorda (N)', 1],
  ['N', 'Notocorda (N)', 0],
  ['notocordio', 'Notocorda (N)', 0.95],
  ['Pelvis renal', 'Pelvis renal (prn)', 1],
  ['prn', 'Pelvis renal (prn)', 0],
  ['Mesodermo somítico', 'Mesodermo somítico o paraxial', 1],
  ['mesodermo paraxial', 'Mesodermo somítico o paraxial', 1],
  ['mesodermo somítico o paraxial', 'Mesodermo somítico o paraxial', 1],
  ['mesodermo lateral', 'Mesodermo somítico o paraxial', 0],
  ['Macrófago', 'Macrófago o célula de Hofbauer', 1],
  ['célula de Hofbauer', 'Macrófago o célula de Hofbauer', 1],
  ['macrofago o celula de hofbauer', 'Macrófago o célula de Hofbauer', 1],
  ['mesonefros', 'Metanefros', 0],
  ['metanefros', 'Metanefros', 1],
  ['metanefro', 'Metanefros', 1],
  ['metanefross', 'Metanefros', 0.95],
  ['ectodermo', 'Endodermo', 0],
  ['endodermo', 'Endodermo', 1],
  ['Hueso hioides', 'Hueso hioides', 1],
  ['hioides', 'Hueso hioides', 1],
  ['hiodes', 'Hueso hioides', 0.95],
  ['Seno maxilar', 'Seno maxilar', 1],
  ['seno maxilar', 'Seno maxilar', 1],
  ['maxilar', 'Seno maxilar', 1],
  ['seno frontal', 'Seno maxilar', 0],
  ['Músculos suprahioideos', 'Músculos suprahioideos', 1],
  ['mm. suprahioideos', 'Músculos suprahioideos', 1],
  ['suprahioideo', 'Músculos suprahioideos', 1],
  ['infrahioideos', 'Músculos suprahioideos', 0],
  ['Ramo marginal mandibular del nervio facial', 'Ramo marginal mandibular del nervio facial', 1],
  ['r. marginal mandibular del n. facial', 'Ramo marginal mandibular del nervio facial', 1],
  ['marginal mandibular facial', 'Ramo marginal mandibular del nervio facial', 1],
  ['ramo marginal mandibular', 'Ramo marginal mandibular del nervio facial', 0],
  ['ramo cervical del nervio facial', 'Ramo marginal mandibular del nervio facial', 0],
  ['Arteria tiroidea superior', 'Arteria tiroidea superior', 1],
  ['tiroidea superior', 'Arteria tiroidea superior', 1],
  ['tiroidea inferior', 'Arteria tiroidea superior', 0],
  ['tiroidea superor', 'Arteria tiroidea superior', 0.95],
  ['a tiroidea superior', 'Arteria tiroidea superior', 1],
  ['vena tiroidea superior', 'Arteria tiroidea superior', 0],
  ['Músculo oblicuo superior', 'Músculo oblicuo superior', 1],
  ['oblicuo inferior', 'Músculo oblicuo superior', 0],
  ['recto superior', 'Músculo oblicuo superior', 0],
  ['Nervio laríngeo recurrente', 'Nervio laríngeo recurrente', 1],
  ['laringeo recurrente', 'Nervio laríngeo recurrente', 1],
  ['recurrente laríngeo', 'Nervio laríngeo recurrente', 1],
  ['nervio laríngeo superior', 'Nervio laríngeo recurrente', 0],
  ['Arteria vertebral', 'Arteria vertebral', 1],
  ['vertebral', 'Arteria vertebral', 1],
  ['a. vertebral derecha', 'Arteria vertebral', 0],
  ['Cartílago aritenoides', 'Cartílago aritenoides', 1],
  ['aritenoides', 'Cartílago aritenoides', 0],
  ['artenoides', 'Cartílago aritenoides', 0],
  ['cricoides', 'Cartílago aritenoides', 0],
  ['tronco tirocervical', 'Tronco tirocervical / tronco tirobicervicoescapular', 1],
  ['tronco tirobicervicoescapular', 'Tronco tirocervical / tronco tirobicervicoescapular', 1],
  ['tronco costocervical', 'Tronco tirocervical / tronco tirobicervicoescapular', 0],
  ['fosa pterigomaxilar', 'Fosa pterigopalatina; fosa pterigomaxilar', 1],
  ['vientre posterior', 'Músculo digástrico: vientre posterior', 1],
  ['vientre anterior', 'Músculo digástrico: vientre posterior', 0],
  ['Primer molar', 'Primer molar', 1],
  ['segundo molar', 'Primer molar', 0],
  ['Lámina de la vértebra', 'Lámina de la vértebra', 1],
  ['la lamina de la vertebra', 'Lámina de la vértebra', 1],
  ['lámina vertebra', 'Lámina de la vértebra', 1],
  ['Músculo largo del cuello', 'Músculo largo del cuello', 1],
  ['largo del cuello', 'Músculo largo del cuello', 1],
  ['corto del cuello', 'Músculo largo del cuello', 0],
  ['Arteria a nivel renal', 'Arteria a nivel renal', 1],
  ['a nivel renal', 'Arteria a nivel renal', 1],
  ['Vena cava superior', 'Vena cava superior', 1],
  ['vv. cavas superiores', 'Vena cava superior', 1],
  ['cava superior', 'Vena cava superior', 1],
  ['cava inferior', 'Vena cava superior', 0],
  ['Glándula sublingual', 'Glándula sublingual', 1],
  ['sublingual', 'Glándula sublingual', 1],
  ['submandibular', 'Glándula sublingual', 0],
  ['Ganglio cervical superior', 'Ganglio cervical superior', 1],
  ['ganglio cervical medio', 'Ganglio cervical superior', 0],
  ['ganglio cervical sup', 'Ganglio cervical superior', 0],
  ['Hueso cigomático', 'Hueso cigomático', 1],
  ['zigomatico', 'Hueso cigomático', 0.95],
  ['cigomatico', 'Hueso cigomático', 1],
  ['nervio optico', 'Nervio óptico (NC II)', 1],
  ['NC II', 'Nervio óptico (NC II)', 1],
  ['Arterias coronarias', 'Arterias coronarias', 1],
  ['aa. coronarias', 'Arterias coronarias', 1],
  ['coronaria', 'Arterias coronarias', 1],
];

/** The whole name with its parentheses or separators: El Rincón gave 0. */
const WHOLE_NAMES = [
  'Hueso cigomático (hueso malar)',
  'Punto nervioso del cuello (punto de Erb)',
  'Tronco tirocervical / tronco tirobicervicoescapular',
  'Fosa pterigopalatina; fosa pterigomaxilar',
  'Músculo digástrico: vientre posterior',
  'Nervio óptico (NC II)',
];

describe('checkAnswer', () => {
  it.each(CASES)('«%s» for «%s» scores %s', (written, name, score) => {
    expect(Math.round(checkAnswer(written, name) * 100) / 100).toBe(score);
  });

  it('accepts at least a hundred cases and turns down the pairs that name another structure', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(150);
    expect(CASES.filter(([, , s]) => isCorrect(s)).length).toBeGreaterThanOrEqual(90);
    for (const [written, name] of [
      ['interna', 'externa'],
      ['externa', 'interna'],
      ['medial', 'lateral'],
      ['lateral', 'medial'],
      ['mayor', 'menor'],
      ['menor', 'mayor'],
      ['superior', 'inferior'],
      ['anterior', 'posterior'],
      ['superficial', 'profundo'],
    ] as const) {
      expect(checkAnswer(`nervio ${written}`, `Nervio ${name}`)).toBe(0);
      expect(checkAnswer(`músculo pectoral ${written}`, `Músculo pectoral ${name}`)).toBe(0);
    }
    expect(checkAnswer('arteria facial', 'Vena facial')).toBe(0);
    expect(checkAnswer('vena facial', 'Arteria facial')).toBe(0);
  });

  it.each(WHOLE_NAMES)('accepts the whole name «%s»', (name) => {
    expect(checkAnswer(name, name)).toBe(1);
    expect(checkAnswer(name.toUpperCase(), name)).toBe(1);
  });

  it('counts as right from 0.9', () => {
    expect(CORRECT_SCORE).toBe(0.9);
    expect(isCorrect(0.95)).toBe(true);
    expect(isCorrect(0.89)).toBe(false);
  });
});

describe('the parts of a name', () => {
  it('keeps each part together, so the words of two structures cannot trade places', () => {
    const name = 'Proceso temporal del hueso cigomático';
    expect(checkAnswer('proceso temporal del hueso cigomatico', name)).toBe(1);
    expect(checkAnswer('temporal proceso del cigomatico hueso', name)).toBe(1);
    expect(checkAnswer('hueso cigomático, proceso temporal', name)).toBe(1);
    expect(checkAnswer('proceso temporal del cigomático', name)).toBe(1);
    expect(checkAnswer('proceso cigomático del hueso temporal', name)).toBe(0);
    expect(checkAnswer('hueso temporal, proceso cigomático', name)).toBe(0);
    expect(checkAnswer('proceso cigomatico temporal', name)).toBe(0);
  });
});

describe('generic words', () => {
  it('may leave out «ramo», «nervio»…, but the ones written have to be in the name', () => {
    const name = 'Ramo marginal mandibular del nervio facial';
    expect(checkAnswer('ramo marginal mandibular del facial', name)).toBe(1);
    expect(checkAnswer('marginal mandibular del nervio facial', name)).toBe(1);
    expect(checkAnswer('nervio marginal mandibular facial', name)).toBe(0);
    expect(checkAnswer('arteria marginal mandibular', name)).toBe(0);
    expect(checkAnswer('ramo facial', name)).toBe(0);
  });
});

describe('what a comma adds', () => {
  it.each([
    ['vena yugular interna', 'Vena yugular interna, reclinada'],
    ['yugular interna', 'Vena yugular interna, reclinada'],
    ['recto lateral', 'Músculo recto lateral, seccionado'],
    ['esplenio de la cabeza', 'Músculo esplenio de la cabeza, cortado y reclinado'],
    ['canal semicircular anterior', 'Canal semicircular anterior, abierto'],
    ['canino permanente inferior', 'Canino permanente inferior, en desarrollo'],
    ['trapecio', 'Músculo trapecio, borde cortado'],
    ['lengua', 'Lengua, vista desde la faringe'],
    [
      'ganglio cervical superior y tronco simpático',
      'Tronco simpático y ganglio cervical superior, desplazados hacia medial',
    ],
    ['cornete medio', 'Cornete medio, del etmoides'],
    ['foramen yugular', 'Foramen yugular, con los nervios glosofaríngeo, vago y accesorio'],
    ['nervio óptico', 'Nervio óptico, NC II'],
    ['NC II', 'Nervio óptico, NC II'],
    ['oftalmico', 'Nervio oftálmico, NC V1, seccionado y reclinado'],
    ['nervio suboccipital', 'Nervio suboccipital, C1'],
    ['nervio óptico, porción intracraneal', 'Nervio óptico, NC II, porción intracraneal'],
    ['nc ii porcion intracraneal', 'Nervio óptico, NC II, porción intracraneal'],
  ])('accepts «%s» for «%s»', (written, name) => {
    expect(checkAnswer(written, name)).toBe(1);
  });

  it.each([
    ['yugular externa', 'Vena yugular interna, reclinada'],
    ['recto medial', 'Músculo recto lateral, seccionado'],
    ['NC III', 'Nervio óptico, NC II'],
    ['C1', 'Nervio suboccipital, C1'],
    ['nervio óptico', 'Nervio óptico, NC II, porción intracraneal'],
    ['nervio óptico, porción intraorbitaria', 'Nervio óptico, NC II, porción intracraneal'],
    ['esternocleidomastoideo', 'Músculo esternocleidomastoideo, cabeza clavicular'],
    ['nervio supraorbitario', 'Nervio supraorbitario, ramo lateral'],
    ['párpado superior', 'Párpado superior, tarso superior'],
    ['vago y accesorio', 'Foramen yugular, con los nervios glosofaríngeo, vago y accesorio'],
  ])(
    'turns down «%s» for «%s»: what is left after the comma is part of the structure',
    (written, name) => {
      expect(checkAnswer(written, name)).toBe(0);
    },
  );
});

describe('the other stations', () => {
  const others = [
    'Músculo esternohioideo',
    'Músculo esternotiroideo',
    'Glándula tiroides',
    'Coroides',
    'Maxilar',
    'Seno maxilar',
    'Arteria maxilar',
    'Mandíbula',
    'Rama de la mandíbula',
    'Arteria facial',
    'Nervio facial',
    'Hueso nasal',
    'Huesos nasales',
    'Músculo recto lateral',
    'Músculo recto lateral, seccionado',
  ];

  it.each([
    ['esternotiroideo', 'Músculo esternohioideo'],
    ['músculo esternotiroideo', 'Músculo esternohioideo'],
    ['coroides', 'Glándula tiroides'],
    ['maxilar', 'Seno maxilar'],
    ['maxilar', 'Arteria maxilar'],
    ['mandíbula', 'Rama de la mandíbula'],
  ])('«%s» names another station better than «%s»', (written, name) => {
    expect(checkAnswer(written, name)).toBeGreaterThanOrEqual(CORRECT_SCORE);
    expect(checkAnswer(written, name, others)).toBe(0);
  });

  it.each([
    ['esternohiodeo', 'Músculo esternohioideo', 0.95],
    ['tiroides', 'Glándula tiroides', 1],
    ['seno maxilar', 'Seno maxilar', 1],
    ['a. maxilar', 'Arteria maxilar', 1],
    ['a maxilar', 'Arteria maxilar', 1],
    ['rama mandibula', 'Rama de la mandíbula', 1],
    ['facial', 'Arteria facial', 1],
    ['facial', 'Nervio facial', 1],
    ['huesos nasales', 'Hueso nasal', 1],
    ['recto lateral', 'Músculo recto lateral, seccionado', 1],
  ])('still takes «%s» for «%s», which no other station names better', (written, name, score) => {
    expect(checkAnswer(written, name, others)).toBe(score);
  });
});

describe('normalize', () => {
  it('spells out the abbreviations, drops accents and the little words', () => {
    expect(normalize('M. Recto  lateral')).toEqual(['musculo', 'recto', 'lateral']);
    expect(normalize('mm.suprahioideos')).toEqual(['musculos', 'suprahioideos']);
    expect(normalize('n facial')).toEqual(['nervio', 'facial']);
    expect(normalize('a nivel renal')).toEqual(['nivel', 'renal']);
    expect(normalize('v')).toEqual(['v']);
    expect(normalize('Ligamento de la cabeza del fémur')).toEqual(['ligamento', 'cabeza', 'femur']);
    expect(normalize('constructor nasal')).toEqual(['constructor', 'nasal']);
    expect(normalize('  ')).toEqual([]);
  });
});

describe('alternatives', () => {
  it('splits on «/», «;», «:» and «o», and keeps the synonyms but not a figure’s letters', () => {
    expect(alternatives('Notocorda (N)')).toEqual([['notocorda']]);
    expect(alternatives('Mesodermo somítico o paraxial')).toEqual([
      ['mesodermo', 'somitico', 'o', 'paraxial'],
      ['mesodermo', 'somitico'],
      ['mesodermo', 'paraxial'],
    ]);
    expect(alternatives('Macrófago o célula de Hofbauer')).toEqual([
      ['macrofago', 'o', 'celula', 'hofbauer'],
      ['macrofago'],
      ['celula', 'hofbauer'],
    ]);
    expect(alternatives('Hueso cigomático (hueso malar, malar)')).toEqual([
      ['hueso', 'cigomatico'],
      ['hueso', 'malar'],
      ['malar'],
    ]);
    expect(alternatives('Blanco o gris')).toEqual([['blanco', 'o', 'gris'], ['blanco'], ['gris']]);
    expect(alternatives('()')).toEqual([]);
  });

  it('adds the name without what a comma says of the dissection, and a cranial nerve by its number', () => {
    expect(alternatives('Glándula tiroides, reclinada')).toEqual([
      ['glandula', 'tiroides', 'reclinada'],
      ['glandula', 'tiroides'],
    ]);
    expect(alternatives('Nervio troclear, NC IV, porción intracraneal')).toEqual([
      ['nervio', 'troclear', 'nc', 'iv', 'porcion', 'intracraneal'],
      ['nervio', 'troclear', 'porcion', 'intracraneal'],
      ['nc', 'iv', 'porcion', 'intracraneal'],
    ]);
    expect(alternatives('Bulbo ocular, esclera y retina')).toEqual([
      ['bulbo', 'ocular', 'esclera', 'retina'],
    ]);
  });
});

describe('levenshtein', () => {
  it('counts insertions, deletions and changes', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('recto', 'recto')).toBe(0);
    expect(levenshtein('lateal', 'lateral')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});
