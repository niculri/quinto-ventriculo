// domainsOf places every function, table and sequence in one domain and refuses the ones nobody placed.
import { describe, expect, it } from 'vitest';
import { domainsOf } from '../domains';

describe('domainsOf', () => {
  it('finds the domain of an object by its kind and name', () => {
    expect(domainsOf('users')('function', 'record_review')).toBe('study');
    expect(domainsOf('content')('table', 'releases')).toBe('release');
    expect(domainsOf('content')('sequence', 'anki_card_change_seq')).toBe('anki');
  });

  it('tells apart a table and a function of the same name', () => {
    expect(domainsOf('content')('table', 'site_settings')).toBe('catalog');
    expect(domainsOf('content')('function', 'site_settings')).toBe('catalog');
  });

  it('throws for an object nobody placed, saying where to add it', () => {
    expect(() => domainsOf('users')('function', 'made_up')).toThrow('db/scripts/schema/domains.ts');
  });
});
