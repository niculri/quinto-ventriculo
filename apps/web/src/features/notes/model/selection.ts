// Where a selection in an article is: its section and the words around it, for reporting that passage.
import { QUOTE_CONTEXT, QUOTE_MAX } from '@qv/schema';
import type { ReportLocation } from '@qv/schema/user';

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
  const title = found.textContent.replace(/\s+/g, ' ').trim();
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
