import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { QUOTE_CONTEXT, QUOTE_MAX } from '@qv/schema';
import type { ReportLocation } from '../reports/repository';

/** Where in the article: the section (its `##` or `###`) a node is in. */
export function sectionAt(
  root: HTMLElement,
  node: Node,
): Pick<ReportLocation, 'section' | 'sectionTitle'> {
  let found: Element | null = null;
  for (const h of root.querySelectorAll('h2[id], h3[id]')) {
    // The heading comes before the node (or contains it).
    if (h === node || h.contains(node)) {
      found = h;
      break;
    }
    if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
    else break;
  }
  if (!found) return {};
  const title = found.textContent?.replace(/\s+/g, ' ').trim();
  return { section: found.id, ...(title ? { sectionTitle: title.slice(0, 200) } : {}) };
}

const squash = (text: string) => text.replace(/\s+/g, ' ');

const BLOCKS = 'p, li, td, th, dt, dd, h2, h3, h4, figcaption, blockquote, pre';

/** The paragraph (or cell, item, heading…) a node is in, inside the article; the article if none. */
function blockOf(root: HTMLElement, node: Node): Node {
  const element = node instanceof Element ? node : node.parentElement;
  const block = element?.closest(BLOCKS);
  return block && root.contains(block) ? block : root;
}

/**
 * What the student selected in the article, if it is inside it: the quote (at most 500 characters), the words around
 * it (to find it again) and its section.
 */
export function readSelection(root: HTMLElement): ReportLocation | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const exact = squash(selection.toString()).trim();
  if (!exact) return null;
  // The words around it, inside its own paragraph (or cell, item, heading): the text of two blocks would come together
  // without a space («…P y EEl tRNA»), and a text fragment would not find it.
  const before = document.createRange();
  before.selectNodeContents(blockOf(root, range.startContainer));
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(blockOf(root, range.endContainer));
  after.setStart(range.endContainer, range.endOffset);
  const prefix = squash(before.toString()).slice(-QUOTE_CONTEXT).trimStart();
  const suffix = squash(after.toString()).slice(0, QUOTE_CONTEXT).trimEnd();
  return {
    ...sectionAt(root, range.startContainer),
    quote: {
      exact: exact.slice(0, QUOTE_MAX),
      ...(prefix.trim() ? { prefix } : {}),
      ...(suffix.trim() ? { suffix } : {}),
    },
  };
}

/**
 * How long the bar stays after the selection goes away. On a phone, the tap on the bar can itself take the selection
 * away before its click arrives (the system does it, and `preventDefault` does not stop a touch): the bar is still
 * there for that click, and reports what was selected. Revisión de cero (2.6).
 */
export const SELECTION_GRACE_MS = 400;

/** The selection inside the article, as it changes (null: nothing selected there). */
export function useArticleSelection(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [selected, setSelected] = useState<ReportLocation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => (root.current ? readSelection(root.current) : null);
    const update = () => {
      clearTimeout(timer);
      const now = read();
      if (now) setSelected(now);
      else timer = setTimeout(() => setSelected(null), SELECTION_GRACE_MS);
    };
    // What is selected now (after a dialog or the image viewer closes; what was before is gone, see below), and every
    // change after.
    update();
    document.addEventListener('selectionchange', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', update);
      // Off (a popup opened): the bar does not come back for a moment with what was selected before it.
      setSelected(null);
    };
  }, [root, enabled]);
  return enabled ? selected : null;
}

/**
 * «Reportar lo seleccionado»: a bar fixed at the bottom of the screen while there is text selected in the article. Not
 * next to the selection: on the phone, that is where the system's handles and menu are. Fixed, so it moves nothing;
 * pressing it does not take the selection away.
 */
export function SelectionReportBar({ onReport }: { onReport: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onReport}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-base font-medium text-bg shadow-soft sm:text-sm"
      >
        <MessageSquareWarning className="size-4" aria-hidden="true" /> Reportar lo seleccionado
      </button>
    </div>
  );
}
