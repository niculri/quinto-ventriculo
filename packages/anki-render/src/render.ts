// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { clozeNumbers } from './cloze';
import {
  fieldIsEmpty,
  parseTemplate,
  renderNodes,
  rendersWithFields,
  TemplateError,
} from './template';

/** What a card needs to be rendered: its note type, its note and where it is. */
export interface RenderCardInput {
  noteType: {
    name: string;
    kind: 'normal' | 'cloze';
    /** Field names in order. */
    fields: string[];
    templates: { name: string; qfmt: string; afmt: string }[];
  };
  /** Field values, in the order of `noteType.fields`. */
  fields: string[];
  tags: string[];
  /** Card ordinal: template index (normal) or cloze number − 1 (cloze). */
  ord: number;
  /** Full name of the card's deck («Parent::Child»). */
  deckName: string;
  cardId?: string;
  flags?: number;
}

export interface RenderedCard {
  question: string;
  answer: string;
  /** Anki would show «empty card» (the note lacks this cloze, or the front renders nothing). */
  isEmpty: boolean;
  /** Template error (unknown field, unclosed conditional): question and answer carry the message. */
  error: string | null;
}

const BLANK_FRONT =
  "<div>The front of this card is blank.<br><a href='https://docs.ankiweb.net/templates/errors.html#front-of-card-is-blank'>More info</a></div>";
const missingCloze = (n: number) =>
  `<div>This card was not generated since the note is missing cloze number ${n}.<br><a href='https://docs.ankiweb.net/templates/errors.html#no-cloze-filter-on-cloze-note-type'>More info</a></div>`;

/**
 * Renders the question and the answer of a card like Anki does (`card.question()` / `card.answer()` without
 * the `<style>` Anki puts first). Sound tags become `[anki:play:q|a:N]` as in Anki; LaTeX is not rendered.
 */
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

/** Anki's `extract_av_tags`: each sound becomes a play marker that the reviewer turns into a button. */
function playTags(html: string, side: 'q' | 'a'): string {
  let i = 0;
  return html.replace(/\[sound:[^\]]+\]/g, () => `[anki:play:${side}:${i++}]`);
}
