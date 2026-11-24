// The cover's filters: only those the gymkana has, and a region without stations counts zero.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '@qv/gymkana';
import { CaStart } from '../CaStart';
import type { Station } from '../../model/stations';

const station: Station = {
  key: 'a:0',
  noteGuid: 'a',
  ord: 0,
  deckId: '1',
  code: null,
  version: null,
  name: 'Nervio facial',
  region: null,
  source: null,
  priority: null,
};

describe('CaStart', () => {
  it('without regions, sources or priorities, offers only the options', () => {
    const data = { places: { regions: [], sources: [] }, stations: [station] };
    render(
      <CaStart
        data={data}
        preferences={defaultPreferences(data.places, data.stations)}
        replacing={false}
        onChoose={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('1 estación elegida')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a region or source without stations shows zero', () => {
    const data = {
      places: {
        regions: [{ tag: 'oido', label: 'Oído' }],
        sources: [
          { label: 'A', tags: ['a'] },
          { label: 'B', tags: ['b'] },
        ],
      },
      stations: [station],
    };
    render(
      <CaStart
        data={data}
        preferences={defaultPreferences(data.places, data.stations)}
        replacing
        onChoose={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getAllByText('0 estaciones')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Empezar otra' })).toBeInTheDocument();
  });
});
