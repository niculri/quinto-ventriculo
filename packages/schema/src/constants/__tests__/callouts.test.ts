// The labels of the note callouts.
import { describe, expect, it } from 'vitest';
import { CALLOUT_LABELS, calloutLabel } from '../callouts';

describe('calloutLabel', () => {
  it('is the label of a known type, empty for a plain note', () => {
    expect(calloutLabel('profe')).toBe('Lo que enfatizó el profe');
    expect(calloutLabel('error')).toBe('Error');
    expect(calloutLabel('note')).toBe('');
  });

  it('is the type with a capital for one that is not known', () => {
    expect(calloutLabel('nuevo')).toBe('Nuevo');
    expect(calloutLabel('')).toBe('');
  });

  it('does not take a label from what every object has: a type named like a property is unknown', () => {
    expect(calloutLabel('toString')).toBe('ToString');
    expect(Object.keys(CALLOUT_LABELS)).toContain('clave');
  });
});
