// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// Renders a card's question and answer as Anki does, including its «empty card» messages.
import { clozeNumbers } from './cloze';
import {
  fieldIsEmpty,
  parseTemplate,
  renderNodes,
  rendersWithFields,
  TemplateError,
} from './template';

export interface RenderCardInput {
  noteType: {
    name: string;
    kind: 'normal' | 'cloze';
    fields: string[];
    templates: { name: string; qfmt: string; afmt: string }[];
  };
  fields: string[];
  tags: string[];
  /** Template index, or cloze number − 1 in a cloze note type. */
  ord: number;
  deckName: string;
  cardId?: string;
  flags?: number;
}

export interface RenderedCard {
  question: string;
  answer: string;
  isEmpty: boolean;
  /** A template error: question and answer carry the message too. */
  error: string | null;
}

const BLANK_FRONT =
  "<div>The front of this card is blank.<br><a href='https://docs.ankiweb.net/templates/errors.html#front-of-card-is-blank'>More info</a></div>";
const missingCloze = (n: number) =>
  `<div>This card was not generated since the note is missing cloze number ${n}.<br><a href='https://docs.ankiweb.net/templates/errors.html#no-cloze-filter-on-cloze-note-type'>More info</a></div>`;

/** Anki's `card.question()` / `card.answer()` without the leading `<style>`; LaTeX is not rendered. */
export function renderCard(input: RenderCardInput): RenderedCard {
  const { noteType } = input;
  const template =
    noteType.kind === 'cloze' ? noteType.templates[0] : noteType.templates[input.ord];
  if (!template) {
    const error = `The note type «${noteType.name}» has no template ${input.ord + 1}.`;
    return { question: error, answer: error, isEmpty: true, error };
  }

  const fields = new Map<string, string>();
  noteType.fields.forEach((name, i) => fields.set(name, input.fields[i] ?? ''));
  const special: [string, string][] = [
    ['Tags', input.tags.join(' ')],
    ['Type', noteType.name],
    ['Subdeck', input.deckName.split('::').at(-1)!],
    ['Deck', input.deckName],
    ['CardFlag', `flag${input.flags ?? 0}`],
    ['Card', template.name],
    ['CardID', input.cardId ?? ''],
    [`c${input.ord + 1}`, '1'],
  ];
  for (const [name, value] of special) if (!fields.has(name)) fields.set(name, value);
  const nonEmpty = new Set([...fields].filter(([, v]) => !fieldIsEmpty(v)).map(([k]) => k));

  try {
    const qnodes = parseTemplate(template.qfmt);
    let question = renderNodes(qnodes, { fields, nonEmpty, cardOrd: input.ord, frontSide: null });

    const emptyMessage =
      noteType.kind === 'cloze'
        ? clozeIsMissing(fields, input.ord + 1)
          ? missingCloze(input.ord + 1)
          : null
        : !rendersWithFields(qnodes, nonEmpty)
          ? BLANK_FRONT
          : null;
    if (emptyMessage) {
      return {
        question: question + emptyMessage,
        answer: emptyMessage,
        isEmpty: true,
        error: null,
      };
    }

    question = playTags(question, 'q');
    const anodes = parseTemplate(template.afmt);
    const answer = playTags(
      renderNodes(anodes, { fields, nonEmpty, cardOrd: input.ord, frontSide: question }),
      'a',
    );
    return { question, answer, isEmpty: false, error: null };
  } catch (e) {
    if (!(e instanceof TemplateError)) throw e;
    return { question: e.message, answer: e.message, isEmpty: false, error: e.message };
  }
}

function clozeIsMissing(fields: Map<string, string>, number: number): boolean {
  for (const value of fields.values()) if (clozeNumbers(value).has(number)) return false;
  return true;
}

/** Anki's `extract_av_tags`. */
function playTags(html: string, side: 'q' | 'a'): string {
  let i = 0;
  return html.replace(/\[sound:[^\]]+\]/g, () => `[anki:play:${side}:${i++}]`);
}
