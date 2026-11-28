// Tests one error of «Errores»: who had it, with every account it knows and no time without a session.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClientErrorGroup } from '@qv/schema';
import { ErrorItem } from '../ErrorItem';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';

const GROUP: ClientErrorGroup = {
  kind: 'unhandled',
  page: '/home',
  message: 'Failed to fetch',
  version: 'v1',
  count: 2,
  firstSeen: '2026-11-27T12:00:00.000Z',
  lastSeen: '2026-11-27T13:00:00.000Z',
  os: 'macOS',
  browser: 'Chrome 131',
  viewport: '1440x900',
  phone: false,
  stack: '',
  systems: ['macOS'],
  browsers: ['Chrome 131'],
  anonymous: 0,
  people: 2,
  accounts: [A, B],
};

describe('ErrorItem', () => {
  it('names every account it knows, and says nothing of times without a session when there were none', () => {
    render(
      <ul>
        <ErrorItem
          group={GROUP}
          days={30}
          labels={[{ id: A, email: 'ana@ug.uchile.cl', name: null }]}
        />
      </ul>,
    );
    expect(screen.getByText('ana@ug.uchile.cl, cuenta 00000000…')).toBeInTheDocument();
    expect(screen.getByText(/2 veces · 2 personas/)).toBeInTheDocument();
    expect(screen.getByText('1440 × 900, computador o tableta')).toBeInTheDocument();
  });
});
