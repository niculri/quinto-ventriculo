// Tests the table's shortcuts: each command runs its action; none while typing (also with no path to read) or busy,
// except going to the search box; and nothing listens once the table is gone.
import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTableShortcuts } from '../useTableShortcuts';

type Props = Parameters<typeof useTableShortcuts>[0];

function shortcuts(patch: Partial<Props> = {}) {
  const box = document.createElement('input');
  document.body.append(box);
  const props: Props = {
    full: true,
    busy: false,
    searchBoxRef: { current: box },
    undo: vi.fn(),
    toggleSuspend: vi.fn(),
    toggleBury: vi.fn(),
    flag: vi.fn(),
    forget: vi.fn(),
    ...patch,
  };
  const hook = renderHook((p: Props) => useTableShortcuts(p), { initialProps: props });
  return { ...hook, props, box };
}

const ctrl = (key: string, more: object = {}) => ({ key, ctrlKey: true, ...more });

afterEach(() => document.body.replaceChildren());

describe('a shortcut', () => {
  it.each([
    ['undo', ctrl('z')],
    ['toggleSuspend', ctrl('j')],
    ['toggleBury', ctrl('J', { shiftKey: true })],
    ['forget', ctrl('n', { code: 'KeyN', altKey: true })],
  ] as const)('runs %s', (name, key) => {
    const { props } = shortcuts();
    expect(fireEvent.keyDown(window, key)).toBe(false);
    expect(props[name]).toHaveBeenCalledTimes(1);
  });

  it('puts the flag of its number', () => {
    const { props } = shortcuts();
    fireEvent.keyDown(window, ctrl('4'));
    expect(props.flag).toHaveBeenCalledWith(4);
  });

  it('that is not one lets the browser have the key', () => {
    const { props } = shortcuts();
    expect(fireEvent.keyDown(window, ctrl('q'))).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'j' })).toBe(true);
    expect(props.toggleSuspend).not.toHaveBeenCalled();
  });

  it('does nothing while an action runs', () => {
    const { props } = shortcuts({ busy: true });
    expect(fireEvent.keyDown(window, ctrl('z'))).toBe(true);
    expect(props.undo).not.toHaveBeenCalled();
  });

  it('does nothing while typing in a field, also when the key does not say where it was typed', () => {
    const { props } = shortcuts();
    const field = document.createElement('textarea');
    document.body.append(field);
    fireEvent.keyDown(field, ctrl('j'));
    const event = new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true });
    Object.defineProperty(event, 'composedPath', { value: () => [] });
    field.dispatchEvent(event);
    expect(props.toggleSuspend).not.toHaveBeenCalled();
  });

  it('to the search box works even while typing or busy', () => {
    const { box } = shortcuts({ busy: true });
    const field = document.createElement('textarea');
    document.body.append(field);
    expect(fireEvent.keyDown(field, ctrl('f'))).toBe(false);
    expect(document.activeElement).toBe(box);
  });

  it('to the search box does nothing without one', () => {
    shortcuts({ searchBoxRef: { current: null } });
    expect(fireEvent.keyDown(window, ctrl('f'))).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('uses the newest actions, and nothing once the table is gone', () => {
    const { rerender, props, unmount } = shortcuts();
    const newer = vi.fn();
    rerender({ ...props, undo: newer });
    fireEvent.keyDown(window, ctrl('z'));
    expect(newer).toHaveBeenCalledTimes(1);
    expect(props.undo).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(window, ctrl('z'));
    expect(newer).toHaveBeenCalledTimes(1);
  });
});
