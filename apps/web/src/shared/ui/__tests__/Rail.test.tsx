// Tests the right column: what a page puts in it goes to the column, and nowhere where there is none.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Rail, RailContext } from '../Rail';

describe('the rail', () => {
  it('puts its content in the column the frame provides, not where the page draws it', () => {
    const column = document.createElement('aside');
    document.body.append(column);
    render(
      <RailContext value={column}>
        <main>
          <Rail>Índice</Rail>
        </main>
      </RailContext>,
    );
    expect(column).toHaveTextContent('Índice');
    expect(screen.getByRole('main')).toBeEmptyDOMElement();
    column.remove();
  });

  it('shows nothing where there is no column (a phone)', () => {
    render(<Rail>Índice</Rail>);
    expect(screen.queryByText('Índice')).toBeNull();
  });
});
