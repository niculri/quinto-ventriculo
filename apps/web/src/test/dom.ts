// DOM helpers shared by the flow tests: text nodes, the text of a shown card, the load of a deck page and a menu choice.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { cardShadowRoot } from '../features/decks/components/CardFrame';

export const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

export async function cardText(label: RegExp) {
  const region = await screen.findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!.querySelector('.card')!.textContent;
}

export async function pageLoad() {
  const group = await screen.findByRole('group', { name: 'Para hoy' });
  const button = await within(group).findByRole('button');
  return Number(/(\d+) para hoy/.exec(button.textContent)?.[1] ?? 0);
}

export async function chooseIn(trigger: HTMLElement, option: string | RegExp) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}

/**
 * What a screen says without how it is dressed, for a snapshot: no classes, no router marks and each icon as its name. A
 * restyle or a new version of the icons or of the router then does not break the photo of the structure.
 */
export function structure(root: Element): string {
  const copy = root.cloneNode(true) as Element;
  for (const svg of copy.querySelectorAll('svg')) {
    const name = [...svg.classList].find((c) => c.startsWith('lucide-'))?.slice('lucide-'.length);
    const icon = document.createElement('svg');
    icon.setAttribute('data-icon', name ?? '');
    for (const attr of ['aria-hidden', 'aria-label', 'role']) {
      const value = svg.getAttribute(attr);
      if (value !== null) icon.setAttribute(attr, value);
    }
    svg.replaceWith(icon);
  }
  for (const el of copy.querySelectorAll('[class]')) el.removeAttribute('class');
  for (const el of copy.querySelectorAll('[data-discover]')) el.removeAttribute('data-discover');
  return copy.innerHTML;
}
