// The spoken length of an interval: which unit it picks and how it rounds.
import { describe, expect, it } from 'vitest';
import { nextLearnMessage, timeSpan } from '../timespan';

const MIN = 60;
const HOUR = 3600;
const DAY = 86_400;

describe('timeSpan', () => {
  it('rounds seconds and days to whole numbers and the other units to one decimal', () => {
    expect(timeSpan(45)).toBe('45 segundos');
    expect(timeSpan(10 * MIN)).toBe('10 minutos');
    expect(timeSpan(90 * MIN)).toBe('1,5 horas');
    expect(timeSpan(3 * DAY)).toBe('3 días');
    expect(timeSpan(1.5 * DAY)).toBe('2 días');
  });

  it('uses the singular only for exactly one after rounding', () => {
    expect(timeSpan(1)).toBe('1 segundo');
    expect(timeSpan(MIN)).toBe('1 minuto');
    expect(timeSpan(HOUR)).toBe('1 hora');
    expect(timeSpan(DAY)).toBe('1 día');
    expect(timeSpan(HOUR * 1.04)).toBe('1 hora');
  });

  it('goes to the next unit when the current one would be less than a whole', () => {
    expect(timeSpan(59)).toBe('59 segundos');
    expect(timeSpan(60)).toBe('1 minuto');
    expect(timeSpan(3599)).toMatch(/minutos$/);
    expect(timeSpan(HOUR)).toMatch(/hora$/);
  });
});

describe('nextLearnMessage', () => {
  it('is empty when the next learning card is a day away or more', () => {
    expect(nextLearnMessage(DAY, 3)).toBe('');
    expect(nextLearnMessage(DAY - 1, 3)).not.toBe('');
  });

  it('says how long and how many are left, in the singular and the plural', () => {
    expect(nextLearnMessage(600, 1)).toBe(
      'La próxima tarjeta estará lista en 10 minutos. Hay una tarjeta restante en la cola de aprendizaje programada para hoy más tarde.',
    );
    expect(nextLearnMessage(3600, 2)).toBe(
      'La próxima tarjeta estará lista en 1 hora. Hay 2 tarjetas restantes en la cola de aprendizaje programadas para hoy más tarde.',
    );
  });
});
