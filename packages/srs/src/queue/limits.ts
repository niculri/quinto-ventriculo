// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The daily limits, which add up through the deck tree (rslib/src/decks/limits.rs), the order of the decks
 * (decks/name.rs) and what each deck studied today (decks/stats.rs).
 */
import type { Queue } from '../card';
import type { DeckConfig } from '../config';
import type { GlobalSettings, QueueDeck, StudiedToday } from './base';

/**
 * decks/stats.rs `update_deck_stats`: an answer counts in its deck and every deck above it, by the card's queue
 * before answering (an intraday learning card counts nothing).
 */
export function countStudiedToday(
  answers: Iterable<{ deckId: string; queue: Queue }>,
  decks: readonly { id: string; name: string }[],
): Map<string, StudiedToday> {
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const nameOf = new Map(decks.map((d) => [d.id, d.name]));
  const out = new Map<string, StudiedToday>();
  for (const { deckId, queue } of answers) {
    const isNew = queue === 'new';
    if (!isNew && queue !== 'review' && queue !== 'dayLearn') continue;
    const name = nameOf.get(deckId);
    const parts = name?.split('::') ?? [];
    const ids = name
      ? parts.flatMap((_, i) => idOf.get(parts.slice(0, i + 1).join('::')) ?? [])
      : [deckId];
    for (const id of ids) {
      const s = out.get(id) ?? { newCount: 0, reviewCount: 0 };
      if (isNew) s.newCount++;
      else s.reviewCount++;
      out.set(id, s);
    }
  }
  return out;
}

const levelOf = (name: string) => name.split('::').length;

/**
 * Anki sorts decks by the stored name, with «::» as \x1f (decks/name.rs) and case folded (`unicase`): a deck is
 * followed by its subdecks before a deck named the same plus a suffix.
 */
const deckSortKey = (name: string) => name.replaceAll('::', '\x1f').toUpperCase().toLowerCase();

/** By code points, as Rust compares strings (`<` in JavaScript puts emoji before «Ａ»). */
function cmpCodePoints(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return a.codePointAt(i)! - b.codePointAt(i)!;
  }
  return a.length - b.length;
}

/** Anki's deck list order (`order by name`). */
export function sortDecksByName<T extends { name: string }>(decks: readonly T[]): T[] {
  return decks
    .map((deck) => ({ deck, key: deckSortKey(deck.name) }))
    .sort((a, b) => cmpCodePoints(a.key, b.key))
    .map(({ deck }) => deck);
}

interface Limits {
  review: number;
  new: number;
  capNewToReview: boolean;
}

interface LimitNode {
  limits: Limits;
  parent: LimitNode | null;
  children: LimitNode[];
}

function remainingLimits(
  config: DeckConfig,
  studied: StudiedToday | undefined,
  newIgnoresReviewLimit: boolean,
): Limits {
  let review = config.reviewsPerDay - (studied?.reviewCount ?? 0);
  let nw = config.newPerDay - (studied?.newCount ?? 0);
  if (!newIgnoresReviewLimit) {
    review -= studied?.newCount ?? 0;
    nw = Math.min(nw, review);
  }
  return {
    review: Math.max(0, review),
    new: Math.max(0, nw),
    capNewToReview: !newIgnoresReviewLimit,
  };
}

/** The daily limits, which add up through the deck tree (rslib/src/decks/limits.rs). */
export class LimitTree {
  private readonly map = new Map<string, LimitNode>();
  readonly root: LimitNode;

  /** `decks` sorted by sortDecksByName, the topmost first (LimitTreeMap::build). */
  constructor(
    decks: QueueDeck[],
    studied: ReadonlyMap<string, StudiedToday>,
    newIgnoresReviewLimit: boolean,
  ) {
    const make = (d: QueueDeck, parent: LimitNode | null): LimitNode => {
      const limits = remainingLimits(d.config, studied.get(d.id), newIgnoresReviewLimit);
      if (parent) {
        limits.review = Math.min(limits.review, parent.limits.review);
        limits.new = Math.min(limits.new, parent.limits.new);
      }
      const node: LimitNode = { limits, parent, children: [] };
      parent?.children.push(node);
      this.map.set(d.id, node);
      return node;
    };
    const [first, ...rest] = decks;
    this.root = make(first!, null);
    // Each deck hangs from the last deck one level up (decks come sorted, so that is its parent).
    const stack: { level: number; node: LimitNode }[] = [
      { level: levelOf(first!.name), node: this.root },
    ];
    for (const d of rest) {
      const level = levelOf(d.name);
      while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop();
      const top = stack[stack.length - 1]!;
      if (level !== top.level + 1) continue; // a gap in the tree: Anki skips it too
      stack.push({ level, node: make(d, top.node) });
    }
  }

  rootReached(kind: 'review' | 'new'): boolean {
    return this.root.limits[kind] === 0;
  }

  reached(deckId: string, kind: 'review' | 'new'): boolean {
    const node = this.map.get(deckId);
    return !node || node.limits[kind] === 0;
  }

  has(deckId: string): boolean {
    return this.map.has(deckId);
  }

  decrement(deckId: string, kind: 'review' | 'new'): void {
    for (let node = this.map.get(deckId) ?? null; node; node = node.parent) {
      const before = { ...node.limits };
      if (kind === 'review') {
        node.limits.review = Math.max(0, node.limits.review - 1);
        if (node.limits.capNewToReview)
          node.limits.new = Math.min(node.limits.new, node.limits.review);
      } else {
        node.limits.new = Math.max(0, node.limits.new - 1);
      }
      const reachedZero =
        (before.review > 0 && node.limits.review === 0) ||
        (before.new > 0 && node.limits.new === 0);
      if (reachedZero) capDescendants(node, node.limits);
    }
  }
}

function capDescendants(node: LimitNode, limits: Limits) {
  node.limits.review = Math.min(node.limits.review, limits.review);
  node.limits.new = Math.min(node.limits.new, limits.new);
  for (const child of node.children) capDescendants(child, limits);
}

/** The root deck and its subdecks in Anki's order, and their limits (also the parents' with applyAllParentLimits). */
export function activeLimits(
  decks: readonly QueueDeck[],
  root: QueueDeck,
  studiedToday: ReadonlyMap<string, StudiedToday>,
  settings: GlobalSettings,
): { active: QueueDeck[]; limits: LimitTree } {
  const isActive = (d: QueueDeck) => d.name === root.name || d.name.startsWith(`${root.name}::`);
  const active = sortDecksByName(decks.filter(isActive));
  const parents = settings.applyAllParentLimits
    ? sortDecksByName(decks.filter((d) => root.name.startsWith(`${d.name}::`)))
    : [];
  const limits = new LimitTree(
    [...parents, ...active],
    studiedToday,
    settings.newCardsIgnoreReviewLimit,
  );
  return { active, limits };
}
