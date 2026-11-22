// Tests the dropdown menus' root: with `closeOnly`, a tap outside only closes the menu and its click never reaches
// what is under it; without it, the tap goes through.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuRoot } from '../MenuRoot';

function Page({ closeOnly, onUnder }: { closeOnly?: boolean; onUnder: () => void }) {
  return (
    <>
      <MenuRoot {...(closeOnly === undefined ? {} : { closeOnly })}>
        <Menu.Trigger>Más</Menu.Trigger>
        <Menu.Portal>
          <Menu.Content>
            <Menu.Item>Saltar</Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </MenuRoot>
      <button type="button" onClick={onUnder}>
        Mostrar respuesta
      </button>
    </>
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Más' }));
  expect(await screen.findByRole('menu')).toBeInTheDocument();
};
const under = () => screen.getByRole('button', { name: 'Mostrar respuesta' });

describe('a menu with closeOnly', () => {
  it('closes on a tap outside, and the tap does not press what is under it; the next one does', async () => {
    const user = userEvent.setup();
    const onUnder = vi.fn();
    render(<Page closeOnly onUnder={onUnder} />);
    await open(user);
    await user.click(under());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onUnder).not.toHaveBeenCalled();
    await user.click(under());
    expect(onUnder).toHaveBeenCalledTimes(1);
  });

  it('a press outside that ends without a click (a drag) does not swallow a later click', async () => {
    const user = userEvent.setup();
    const onUnder = vi.fn();
    render(<Page closeOnly onUnder={onUnder} />);
    await open(user);
    fireEvent.pointerDown(under());
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.pointerDown(under());
    fireEvent.click(under());
    expect(onUnder).toHaveBeenCalledTimes(1);
  });

  it('stays open for a press inside it, its trigger closes it, and so does a press on the page itself', async () => {
    const user = userEvent.setup();
    render(<Page closeOnly onUnder={() => {}} />);
    await open(user);
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Saltar' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Más' }));
    expect(screen.queryByRole('menu')).toBeNull();
    await open(user);
    fireEvent.pointerDown(document);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('a menu without closeOnly', () => {
  it('lets the tap outside reach what is under it', async () => {
    const user = userEvent.setup();
    const onUnder = vi.fn();
    render(<Page onUnder={onUnder} />);
    await open(user);
    await user.click(under());
    expect(onUnder).toHaveBeenCalledTimes(1);
  });
});
