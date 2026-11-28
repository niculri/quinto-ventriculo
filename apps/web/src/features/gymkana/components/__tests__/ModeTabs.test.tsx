// The gymkana's two tabs: the chosen one is selected and reachable with Tab, and the arrows go to the other one.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModeTabs, caTab } from '../ModeTabs';

describe('ModeTabs', () => {
  it('marks the chosen tab and moves to the other with the arrows', async () => {
    const user = userEvent.setup();
    const onMode = vi.fn();
    render(<ModeTabs active="anki" onMode={onMode} />);
    const anki = screen.getByRole('tab', { name: /Modo Anki/ });
    expect(anki).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Modo CA/ })).toHaveAttribute('tabindex', '-1');
    anki.focus();
    await user.keyboard('{ArrowRight}');
    expect(onMode).toHaveBeenLastCalledWith('ca');
    await user.keyboard('{ArrowLeft}');
    expect(onMode).toHaveBeenCalledTimes(2);
    await user.keyboard('a');
    expect(onMode).toHaveBeenCalledTimes(2);
  });

  it('opens the gymkana on its «Modo CA» tab', () => {
    expect(caTab('/x/gymkana')).toBe('/x/gymkana?modo=ca');
  });
});
