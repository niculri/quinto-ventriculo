// Tests which section a URL's hash points to.
import { describe, expect, it } from 'vitest';
import { anchorOf } from '../anchor';

describe('anchorOf', () => {
  it.each([
    ['#ribosomas', 'ribosomas'],
    ['#ribosomas:~:text=Dos', 'ribosomas'],
    ['#n%C3%BAcleo%20celular', 'núcleo celular'],
    ['#100%', '100%'],
    ['#', null],
    ['', null],
    ['#:~:text=solo', null],
  ])('%j points to %j', (hash, id) => {
    expect(anchorOf(hash)).toBe(id);
  });
});
