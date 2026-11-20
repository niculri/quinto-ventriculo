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
  return cardShadowRoot(region)!.querySelector('.card')!.textContent ?? '';
}

export async function pageLoad() {
  const group = await screen.findByRole('group', { name: 'Para hoy' });
  const button = await within(group).findByRole('button');
  return Number(/(\d+) para hoy/.exec(button.textContent!)?.[1] ?? 0);
}

export async function chooseIn(trigger: HTMLElement, option: string | RegExp) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}
