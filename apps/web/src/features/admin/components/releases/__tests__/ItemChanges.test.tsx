// Tests what «Publicaciones» shows of each card, article and question that changes: which fields it shows for each
// operation, the version, the cards that move, the key that changes, and the words taken out and put in.
import { render, screen } from '@testing-library/react';
import type { ReleaseArticleItem, ReleaseCardItem, ReleaseQuestionItem } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { ArticleChange, CardChange, QuestionChange } from '../ItemChanges';

const card = (over: Partial<ReleaseCardItem>): ReleaseCardItem => ({
  guid: 'guid-1',
  op: 'changed',
  classification: 'no_answer',
  changedFields: [],
  code: 'T-XX-01',
  versionBefore: null,
  versionAfter: null,
  noteType: null,
  fieldsBefore: null,
  fieldsAfter: null,
  cards: [],
  ...over,
});
const slot = (
  ord: number,
  op: ReleaseCardItem['cards'][number]['op'],
  before: string | null,
  after: string | null,
): ReleaseCardItem['cards'][number] => ({
  ord,
  op,
  deckBefore: null,
  deckAfter: null,
  deckNameBefore: before,
  deckNameAfter: after,
});

const article = (over: Partial<ReleaseArticleItem>): ReleaseArticleItem => ({
  id: 'AP-1',
  op: 'changed',
  classification: 'content',
  title: 'Núcleo',
  titleBefore: null,
  versionBefore: 1,
  practiceBefore: null,
  practiceAfter: null,
  sections: [],
  ...over,
});

const question = (over: Partial<ReleaseQuestionItem>): ReleaseQuestionItem => ({
  key: 'k',
  quizId: 'quiz',
  id: 'q-1',
  op: 'changed',
  classification: 'answer',
  keyChanged: false,
  moved: false,
  sectionBefore: null,
  sectionAfter: null,
  groupBefore: null,
  groupAfter: null,
  figuresChanged: false,
  before: null,
  after: null,
  ...over,
});

const show = (el: React.ReactElement) => render(<ul>{el}</ul>).container.querySelector('li')!;
const labels = (li: Element) =>
  [...li.querySelectorAll('p.text-xs.font-medium')].map((p) => p.textContent);

describe('a card that changes', () => {
  it('says the version only when it goes from one to another, and reads by its guid without a code', () => {
    expect(
      show(<CardChange item={card({ versionBefore: 1, versionAfter: 2 })} />),
    ).toHaveTextContent(/^T-XX-01 · \.1 → \.2/);
    expect(
      show(<CardChange item={card({ versionBefore: 2, versionAfter: 2 })} />).textContent,
    ).not.toContain('→');
    expect(
      show(<CardChange item={card({ versionBefore: null, versionAfter: 2 })} />).textContent,
    ).not.toContain('→');
    expect(show(<CardChange item={card({ code: null })} />)).toHaveTextContent(/^guid-1/);
  });

  it('a changed card shows the fields that changed, with the words that go out and come in', () => {
    const li = show(
      <CardChange
        item={card({
          changedFields: ['Reverso'],
          fieldsBefore: { Frente: 'igual', Reverso: 'la mitral cierra' },
          fieldsAfter: { Frente: 'igual', Reverso: 'la tricúspide cierra' },
        })}
      />,
    );
    expect(labels(li)).toEqual(['Reverso']);
    expect(li.querySelector('del')).toHaveTextContent('mitral');
    expect(li.querySelector('ins')).toHaveTextContent('tricúspide');
    expect(li.querySelector('del')!.parentElement!.textContent).toBe('mitral ');
  });

  it('with the same fields, it says whether what the card shows changes or only reads the same', () => {
    expect(show(<CardChange item={card({ classification: 'answer' })} />)).toHaveTextContent(
      'Los campos se leen igual, pero cambia lo que muestra la tarjeta',
    );
    expect(show(<CardChange item={card({ classification: 'format' })} />)).toHaveTextContent(
      'El texto se lee igual.',
    );
  });

  it('a new or removed card shows its first field: the note type’s, or the first one it has', () => {
    const typed = card({
      op: 'added',
      noteType: {
        id: '1',
        name: 'Básica',
        kind: 'normal',
        occlusion: false,
        fields: ['Frente', 'Reverso'],
      },
      fieldsAfter: { Reverso: 'r', Frente: 'f' },
    });
    expect(labels(show(<CardChange item={typed} />))).toEqual(['Frente']);
    expect(
      labels(
        show(<CardChange item={card({ op: 'added', fieldsAfter: { Texto: 't', Extra: 'e' } })} />),
      ),
    ).toEqual(['Texto']);
    expect(
      labels(show(<CardChange item={card({ op: 'removed', fieldsBefore: { Viejo: 'v' } })} />)),
    ).toEqual(['Viejo']);
    expect(labels(show(<CardChange item={card({ op: 'removed' })} />))).toEqual([]);
  });

  it('lists the cards that move, come in or go out by the last part of the deck, and not the ones that only change', () => {
    const li = show(
      <CardChange
        item={card({
          changedFields: ['Frente'],
          fieldsBefore: { Frente: 'a' },
          fieldsAfter: { Frente: 'b' },
          cards: [
            slot(0, 'moved', 'Curso::Viejo', 'Curso::Nuevo'),
            slot(1, 'added', null, 'Curso::Nuevo'),
            slot(2, 'removed', 'Curso::Viejo', null),
            slot(3, 'changed', 'Curso::Viejo', 'Curso::Viejo'),
            slot(4, 'moved', null, null),
            slot(5, 'added', null, null),
            slot(6, 'removed', null, null),
          ],
        })}
      />,
    );
    expect([...li.querySelectorAll('ul li')].map((x) => x.textContent)).toEqual([
      'Tarjeta 1: de «Viejo» a «Nuevo»',
      'Tarjeta 2: nueva, en «Nuevo»',
      'Tarjeta 3: sale de «Viejo»',
      'Tarjeta 5: de «» a «»',
      'Tarjeta 6: nueva, en «»',
      'Tarjeta 7: sale de «»',
    ]);
  });

  it('a changed note whose cards only change lists no cards', () => {
    const li = show(<CardChange item={card({ cards: [slot(0, 'changed', 'A', 'A')] })} />);
    expect(li.querySelector('ul')).toBeNull();
  });

  it('a new note’s cards are not listed: only a move is', () => {
    const added = card({ op: 'added', cards: [slot(0, 'added', null, 'Mazo')] });
    expect(show(<CardChange item={added} />).querySelector('ul')).toBeNull();
    const moved = card({ op: 'added', cards: [slot(0, 'moved', 'A', 'B')] });
    expect(show(<CardChange item={moved} />).querySelector('ul')).not.toBeNull();
  });

  it('without a class there is no class badge', () => {
    render(
      <ul>
        <CardChange item={card({ classification: null, op: 'added' })} />
      </ul>,
    );
    expect(screen.getByText('Nueva')).toBeInTheDocument();
    expect(screen.queryByText(/respuesta|formato|texto/i)).toBeNull();
  });
});

describe('an article that changes', () => {
  it('a new title is a field; each section says if it is new or goes out', () => {
    const li = show(
      <ArticleChange
        item={article({
          titleBefore: 'Núcleo viejo',
          sections: [
            { anchor: 'a', title: 'Poros', op: 'added', before: null, after: 'x' },
            { anchor: '', title: 'Inicio', op: 'removed', before: 'y', after: null },
            { anchor: 'c', title: 'Lámina', op: 'changed', before: 'z', after: 'w' },
          ],
        })}
      />,
    );
    expect(labels(li)).toEqual(['Título', 'Poros (nueva)', 'Inicio (sale)', 'Lámina']);
    expect(li).toHaveTextContent(/^AP-1 · Núcleo/);
  });

  it('the same title is not a field, and changing without sections reads the same', () => {
    const li = show(<ArticleChange item={article({ titleBefore: 'Núcleo' })} />);
    expect(labels(li)).toEqual([]);
    expect(li).toHaveTextContent('El texto se lee igual.');
    expect(show(<ArticleChange item={article({ op: 'added' })} />)).not.toHaveTextContent(
      'se lee igual',
    );
  });
});

describe('a question that changes', () => {
  it('a changed key says which was and which is; a missing one is a dash', () => {
    const li = show(
      <QuestionChange
        item={question({ keyChanged: true, before: { correct: 0 }, after: { correct: 2 } })}
      />,
    );
    expect(li).toHaveTextContent('Cambia la clave');
    expect(li).toHaveTextContent('La correcta era la a) y ahora es la c)');
    expect(
      show(<QuestionChange item={question({ keyChanged: true, after: { correct: 1 } })} />),
    ).toHaveTextContent('La correcta era la — y ahora es la b)');
  });

  it('a moved question says from where to where', () => {
    const li = show(
      <QuestionChange
        item={question({
          moved: true,
          sectionBefore: 'Tema 1',
          groupBefore: 'A',
          sectionAfter: 'Tema 2',
        })}
      />,
    );
    expect(li).toHaveTextContent('Pasa de «Tema 1 · A» a «Tema 2 · ».');
    expect(show(<QuestionChange item={question({ moved: true })} />)).toHaveTextContent(
      'Pasa de « · » a « · ».',
    );
  });

  it('a changed question shows only the fields and alternatives that differ', () => {
    const li = show(
      <QuestionChange
        item={question({
          before: { prompt: '¿Cuál?', answer: 'x', options: ['uno', 'dos', 'tres'] },
          after: { prompt: '¿Cuál?', answer: 'y', options: ['uno', 'DOS'] },
          figuresChanged: true,
        })}
      />,
    );
    expect(labels(li)).toEqual(['Respuesta', 'Alternativa b)', 'Alternativa c)']);
    expect(li).toHaveTextContent('Cambia una figura.');
  });

  it('a new question shows every field it has and every alternative', () => {
    const li = show(
      <QuestionChange
        item={question({
          op: 'added',
          after: {
            context: 'c',
            prompt: 'p',
            explanation: 'e',
            options: ['a', 'b'],
            correct: 'no-es-número',
          },
        })}
      />,
    );
    expect(labels(li)).toEqual([
      'Contexto',
      'Pregunta',
      'Explicación',
      'Alternativa a)',
      'Alternativa b)',
    ]);
    expect(li).not.toHaveTextContent('Cambia una figura.');
  });

  it('alternatives that are not a list count as none', () => {
    const li = show(
      <QuestionChange
        item={question({ op: 'removed', before: { options: 'texto', prompt: 'p' } })}
      />,
    );
    expect(labels(li)).toEqual(['Pregunta']);
  });
});
