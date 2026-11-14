// Reporting a passage of an article: where a selection is, the words around it, and the bar to report it.

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { QUOTE_CONTEXT, QUOTE_MAX } from '@qv/schema';
import type { ReportLocation } from '../reports/repository';

export function sectionAt(
  root: HTMLElement,
  node: Node,
): Pick<ReportLocation, 'section' | 'sectionTitle'> {
  let found: Element | null = null;
  for (const h of root.querySelectorAll('h2[id], h3[id]')) {
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

function blockOf(root: HTMLElement, node: Node): Node {
  const element = node instanceof Element ? node : node.parentElement;
  const block = element?.closest(BLOCKS);
  return block && root.contains(block) ? block : root;
}

export function readSelection(root: HTMLElement): ReportLocation | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const exact = squash(selection.toString()).trim();
  if (!exact) return null;
  // Context only from its own block: two blocks' text joins without a space, and a text fragment would not match.
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

/** On a phone the tap on the bar can clear the selection before its click arrives: the bar waits for that click. */
const SELECTION_GRACE_MS = 400;

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
    update();
    document.addEventListener('selectionchange', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', update);
      setSelected(null);
    };
  }, [root, enabled]);
  return enabled ? selected : null;
}

/** Fixed at the bottom, not next to the selection, where the phone's handles and menu are. */
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
