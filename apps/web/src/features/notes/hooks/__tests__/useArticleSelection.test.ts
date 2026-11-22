// Tests that a selection is only read inside the article and while the hook is enabled.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useArticleSelection } from '../useArticleSelection';

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

function selectText(el: Element) {
  const range = document.createRange();
  range.selectNodeContents(el);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

describe('useArticleSelection', () => {
  it('without the article in the page a selection is not read', () => {
    const p = document.createElement('p');
    p.textContent = 'Texto';
    document.body.append(p);
    const ref = { current: null };
    const { result } = renderHook(() => useArticleSelection(ref, true));
    act(() => selectText(p));
    expect(result.current).toBeNull();
  });

  it('disabled, it gives nothing even with a passage selected; enabled again, it reads it at once', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Texto del apunte</p>';
    document.body.append(root);
    act(() => selectText(root.firstElementChild!));
    const ref = { current: root };
    const { result, rerender } = renderHook(({ on }) => useArticleSelection(ref, on), {
      initialProps: { on: false },
    });
    expect(result.current).toBeNull();
    rerender({ on: true });
    expect(result.current?.quote?.exact).toBe('Texto del apunte');
  });
});
