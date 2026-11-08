import { describe, expect, it } from 'vitest';
import { splitStatements } from '../src';

const items = (html: string) => splitStatements(html)?.items.map((s) => [s.numeral, s.html]);

describe('statements I, II, III', () => {
  it('as the sources write them: «I.», «I)», «I.-», without a space, without punctuation, lowercase', () => {
    expect(items('¿Cuáles?<br>I. Uno<br>II. Dos<br>III. Tres')).toEqual([
      ['I', 'Uno'],
      ['II', 'Dos'],
      ['III', 'Tres'],
    ]);
    expect(items('x<br>I) a<br>II) b')).toEqual([
      ['I', 'a'],
      ['II', 'b'],
    ]);
    expect(items('x<br>I.- a<br>II.-b<br>III.- c<br>IV.- d<br>V.- e<br>VI.- f')).toHaveLength(6);
    expect(items('x<br>I Su síntesis<br>II. Su mRNA<br>III La enzima')).toEqual([
      ['I', 'Su síntesis'],
      ['II', 'Su mRNA'],
      ['III', 'La enzima'],
    ]);
    expect(items('x<br>i. uno<br>ii. dos<br>iii. tres<br>IV. cuatro')?.map((s) => s[0])).toEqual([
      'i',
      'ii',
      'iii',
      'IV',
    ]);
  });

  it('the text before and after, and the list at the start', () => {
    expect(splitStatements('Respecto:<br>I. a<br>II. b<br>¿Cuál?')).toEqual({
      before: 'Respecto:',
      items: [
        { numeral: 'I', html: 'a' },
        { numeral: 'II', html: 'b' },
      ],
      after: '¿Cuál?',
    });
    expect(splitStatements('I) a<br>II) b')?.before).toBe('');
  });

  it('keeps the inline marks of a statement and joins a line that continues one', () => {
    expect(items('x<br>I. <i>NR1</i> es<br>sigue aquí<br>II. dos')).toEqual([
      ['I', '<i>NR1</i> es<br>sigue aquí'],
      ['II', 'dos'],
    ]);
  });

  it('nothing to split: no numerals, only one, out of order, or numerals inside a line', () => {
    expect(splitStatements('Una pregunta sin afirmaciones')).toBeNull();
    expect(splitStatements('x<br>I. solo una')).toBeNull();
    expect(splitStatements('x<br>II. dos<br>III. tres')).toBeNull();
    expect(splitStatements('La RNA polimerasa II. es sensible<br>a la I. amanitina')).toBeNull();
    expect(splitStatements('Vimos<br>Ideas<br>Iones')).toBeNull();
    expect(items('x<br>I. a<br>III. c')).toBeUndefined();
  });
});
