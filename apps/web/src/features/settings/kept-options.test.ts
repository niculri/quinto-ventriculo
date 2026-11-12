import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETERS,
  defaultConfig,
  newCard,
  parseConfig,
  schedTiming,
  schedulingStates,
} from '@qv/srs';

/**
 * Step 3.4 (ANK-14): «Retención histórica» and editing the FSRS parameters left «Opciones», but @qv/srs did not
 * change: a preset saved with them reads and schedules as before.
 */
describe('a preset saved with what «Opciones» no longer shows', () => {
  const custom = Array.from({ length: 21 }, (_, i) =>
    Number((DEFAULT_PARAMETERS[i]! * 1.3).toFixed(4)),
  );
  const stored = { ...defaultConfig(), historicalRetention: 0.8, fsrsParams: custom };

  it('reads its «Retención histórica» and its parameters', () => {
    const config = parseConfig(JSON.parse(JSON.stringify(stored)));
    expect(config.historicalRetention).toBe(0.8);
    expect(config.fsrsParams).toEqual(custom);
  });

  it('schedules with its own parameters, not with the defaults', () => {
    const timing = schedTiming(Date.UTC(2026, 10, 12, 15) / 1000, 'America/Santiago', 4);
    const key = { noteGuid: 'guid-inventado', ord: 0 };
    const states = (config: ReturnType<typeof parseConfig>) =>
      schedulingStates(key, newCard(0), config, timing, { fuzz: false });
    const own = states(parseConfig(stored));
    const defaults = states(parseConfig({ ...stored, fsrsParams: [] }));
    expect(own).toEqual(states({ ...defaultConfig(), fsrsParams: custom }));
    expect(own.easy).not.toEqual(defaults.easy);
  });
});
