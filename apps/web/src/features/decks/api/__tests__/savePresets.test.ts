// Tests how a changed preset is saved: the user's own in place, an author's one as the user's version that replaces it.

import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@qv/srs';
import type { PresetChoice } from '@qv/study';
import { localStudyRepository } from '../../../progress/api/repository';
import { savePresetDraft } from '../savePresets';

const draft = { ...defaultConfig(), newPerDay: 7 };

describe('saving the draft of a preset', () => {
  it("a user's preset is saved in place, under its id and name, replacing nothing", async () => {
    const study = localStudyRepository(null);
    const mine = await study.savePreset({ name: 'Mío', replaces: null, config: {} });
    const choice: PresetChoice = {
      ref: { kind: 'user', id: mine.id },
      name: 'Mío',
      config: defaultConfig(),
      row: mine,
    };
    await savePresetDraft(study, choice, draft);
    expect(await study.presets()).toEqual([
      expect.objectContaining({ id: mine.id, name: 'Mío', replaces: null, config: { ...draft } }),
    ]);
  });

  it("an author's preset becomes the user's version of it, and a second save edits that version", async () => {
    const study = localStudyRepository(null);
    const author: PresetChoice = {
      ref: { kind: 'author', name: 'Default' },
      name: 'Default',
      config: defaultConfig(),
      row: null,
    };
    const version = await savePresetDraft(study, author, draft);
    expect(version).toMatchObject({ name: 'Default', replaces: 'Default' });
    await savePresetDraft(study, { ...author, row: version }, { ...draft, newPerDay: 3 });
    const saved = await study.presets();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: version.id, config: { newPerDay: 3 } });
  });
});
