// Adding, cloning, renaming and removing a preset, and going back to the author's (by hand, not with `useMutation`:
// `mutate()` would call the repository after React paints the closed dialog or menu).

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DeckConfig } from '@qv/srs';
import { sameRef } from '@qv/study';
import type { PresetChoice, PresetRef } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import { nameProblem } from '../model/presetDrafts';
import { refKey } from '../model/presets';
import { optionsStrings as o } from '../options.strings';

interface Naming {
  title: string;
  initial: string;
  from: DeckConfig;
}

export function usePresetActions({
  choices,
  choice,
  setSelected,
  setDrafts,
  run,
}: {
  choices: PresetChoice[];
  choice: PresetChoice;
  setSelected: (ref: PresetRef) => void;
  setDrafts: Dispatch<SetStateAction<Map<string, DeckConfig>>>;
  run: (what: () => Promise<unknown>) => Promise<void>;
}) {
  const study = useStudyRepository();
  const [naming, setNaming] = useState<Naming | null>(null);
  const [removing, setRemoving] = useState(false);
  const problemText = (p: 'empty' | 'taken' | null) =>
    p === 'empty' ? o.names.empty : p === 'taken' ? o.names.taken : null;
  const checkName = (name: string) =>
    problemText(nameProblem(name, choices, (c) => !sameRef(c.ref, choice.ref)));
  const checkNewName = (name: string) => problemText(nameProblem(name, choices, () => true));
  const addPreset = (name: string, from: DeckConfig) => {
    setNaming(null);
    void run(async () => {
      const p = await study.savePreset({ name, replaces: null, config: { ...from } });
      setSelected({ kind: 'user', id: p.id });
    });
  };
  const renamePreset = (name: string) => {
    if (choice.ref.kind !== 'user' || !choice.row) return;
    const row = choice.row;
    void run(() => study.savePreset({ id: row.id, name, replaces: null, config: row.config }));
  };
  const removePreset = () => {
    setRemoving(false);
    if (choice.ref.kind !== 'user' || !choice.row) return;
    const id = choice.row.id;
    void run(async () => {
      await study.deletePreset(id);
      setSelected(choices[0]!.ref);
    });
  };
  const backToAuthor = () => {
    if (choice.ref.kind !== 'author' || !choice.row) return;
    const id = choice.row.id;
    void run(async () => {
      await study.deletePreset(id);
      setDrafts((d) => {
        const next = new Map(d);
        next.delete(refKey(choice.ref));
        return next;
      });
    });
  };
  return {
    naming,
    setNaming,
    removing,
    setRemoving,
    checkName,
    checkNewName,
    addPreset,
    renamePreset,
    removePreset,
    backToAuthor,
  };
}
