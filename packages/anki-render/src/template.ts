// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { applyFilters } from './filters';
import type { FilterContext } from './filters';

/** Port of Anki's rslib/src/template.rs: lexing, parsing and rendering of a card template. */

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'replacement'; text: string }
  | { kind: 'open'; text: string }
  | { kind: 'negated'; text: string }
  | { kind: 'close'; text: string };

const ALT_DIRECTIVE = '{{=<% %>=}}';
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

function classify(inner: string): Token {
  const start = inner.replace(/^\{+/, '').trim();
  if (utf8Length(start) < 2) return { kind: 'replacement', text: start };
  if (start.startsWith('#')) return { kind: 'open', text: start.slice(1).trimStart() };
  if (start.startsWith('/')) return { kind: 'close', text: start.slice(1).trimStart() };
  if (start.startsWith('^')) return { kind: 'negated', text: start.slice(1).trimStart() };
  return { kind: 'replacement', text: start };
}

function tokenize(template: string): Token[] {
  let [open, close] = ['{{', '}}'];
  if (template.trimStart().startsWith(ALT_DIRECTIVE)) {
    template = trimStartAll(template.trimStart(), ALT_DIRECTIVE);
    [open, close] = ['<%', '%>'];
  }
  const tokens: Token[] = [];
  let textStart = 0;
  let i = 0;
  while (i < template.length) {
    let token: Token | null = null;
    let end = -1;
    if (template.startsWith(open, i)) {
      const closeAt = template.indexOf(close, i + open.length);
      if (closeAt >= 0) {
        token = classify(template.slice(i + open.length, closeAt));
        end = closeAt + close.length;
      }
    }
    if (!token && template.startsWith('<!--', i)) {
      const closeAt = template.indexOf('-->', i + 4);
      if (closeAt >= 0) {
        token = { kind: 'comment', text: template.slice(i + 4, closeAt) };
        end = closeAt + 3;
      }
    }
    if (token) {
      if (i > textStart) tokens.push({ kind: 'text', text: template.slice(textStart, i) });
      tokens.push(token);
      i = textStart = end;
    } else {
      i++;
    }
  }
  if (textStart < template.length) tokens.push({ kind: 'text', text: template.slice(textStart) });
  return tokens;
}

function trimStartAll(text: string, prefix: string): string {
  while (text.startsWith(prefix)) text = text.slice(prefix.length);
  return text;
}

export type ParsedNode =
  | { kind: 'text'; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'replacement'; key: string; filters: string[] }
  | { kind: 'conditional'; key: string; children: ParsedNode[] }
  | { kind: 'negated'; key: string; children: ParsedNode[] };

/** A template that Anki would reject (the message is Anki's, in English). */
export class TemplateError extends Error {
  override name = 'TemplateError';
}

export function parseTemplate(template: string): ParsedNode[] {
  const tokens = tokenize(template);
  let at = 0;
  const parseInner = (openTag: string | null): ParsedNode[] => {
    const nodes: ParsedNode[] = [];
    while (at < tokens.length) {
      const t = tokens[at++]!;
      switch (t.kind) {
        case 'text':
        case 'comment':
          nodes.push({ kind: t.kind, text: t.text });
          break;
        case 'replacement': {
          const parts = t.text.split(':').reverse();
          nodes.push({ kind: 'replacement', key: parts[0]!, filters: parts.slice(1) });
          break;
        }
        case 'open':
          nodes.push({ kind: 'conditional', key: t.text, children: parseInner(t.text) });
          break;
        case 'negated':
          nodes.push({ kind: 'negated', key: t.text, children: parseInner(t.text) });
          break;
        case 'close':
          if (openTag === t.text) return nodes;
          throw new TemplateError(
            openTag === null
              ? `Found '{{/${t.text}}}', but missing '{{#${t.text}}}' or '{{^${t.text}}}'`
              : `Found '{{/${t.text}}}', but expected '{{/${openTag}}}'`,
          );
      }
    }
    if (openTag !== null) throw new TemplateError(`Missing '{{/${openTag}}}'`);
    return nodes;
  };
  return parseInner(null);
}

/** True if the text only has whitespace and empty <br>/<div> tags (Anki's `field_is_empty`). */
export function fieldIsEmpty(text: string): boolean {
  return /^(?:[\t\n\v\f\r ]|<\/?(?:br|div) ?\/?>)*$/i.test(text);
}

const isClozeConditional = (key: string) =>
  /^c\d+$/.test(key) && Number(key.slice(1)) <= 0xffffffff;

export interface RenderContext {
  fields: Map<string, string>;
  nonEmpty: Set<string>;
  /** Template ordinal (card ord). */
  cardOrd: number;
  /** The rendered question, when rendering the answer. */
  frontSide: string | null;
}

export function renderNodes(nodes: ParsedNode[], context: RenderContext): string {
  const filterContext: FilterContext = {
    clozeOrd: context.cardOrd + 1,
    question: context.frontSide === null,
  };
  let out = '';
  const render = (list: ParsedNode[], keep: boolean) => {
    for (const node of list) {
      switch (node.kind) {
        case 'text':
          if (keep) out += node.text;
          break;
        case 'comment':
          if (keep) out += `<!--${node.text}-->`;
          break;
        case 'replacement': {
          if (node.key === 'FrontSide') {
            if (keep) out += context.frontSide ?? '';
            break;
          }
          if (node.key === '' && node.filters.length) break;
          const value = context.fields.get(node.key);
          if (value === undefined) {
            const filters = [...node.filters].reverse().concat('').join(':');
            throw new TemplateError(
              `Found '{{${filters}${node.key}}}', but there is no field called '${node.key}'`,
            );
          }
          // Inside a false conditional Anki keeps checking for errors, but discards the output.
          const text = applyFilters(value, node.filters, node.key, filterContext);
          if (keep) out += text;
          break;
        }
        case 'conditional':
        case 'negated': {
          const negated = node.kind === 'negated';
          let show: boolean;
          if (context.nonEmpty.has(node.key)) show = !negated;
          else if (context.fields.has(node.key) || isClozeConditional(node.key)) show = negated;
          else {
            throw new TemplateError(
              `Found '{{${negated ? '^' : '#'}${node.key}}}', but there is no field called '${node.key}'`,
            );
          }
          render(node.children, keep && show);
          break;
        }
      }
    }
  };
  render(nodes, true);
  return out;
}

/** Does the template render something with these non-empty fields? (Anki's `renders_with_fields`). */
export function rendersWithFields(nodes: ParsedNode[], nonEmpty: Set<string>): boolean {
  const isEmpty = (list: ParsedNode[]): boolean => {
    for (const node of list) {
      if (node.kind === 'replacement') {
        if (nonEmpty.has(node.key)) return false;
      } else if (node.kind === 'conditional') {
        if (nonEmpty.has(node.key) && !isEmpty(node.children)) return false;
      } else if (node.kind === 'negated') {
        if (!nonEmpty.has(node.key) && !isEmpty(node.children)) return false;
      }
    }
    return true;
  };
  return !isEmpty(nodes);
}
