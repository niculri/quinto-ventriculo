// Adding, cloning, renaming and removing a preset, and going back to the author's.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { DeckConfig } from '@qv/srs';
import { sameRef } from '@qv/study';
import type { PresetChoice, PresetRef } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import type { StudyRepository } from '../../progress/api/repository';
import { nameProblem } from '../model/presetDrafts';
import { refKey } from '../model/presets';
import { usePresetActionsStrings as o } from './strings/usePresetActions.strings';

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
  const savePreset = useMutation({
    mutationFn: (p: Parameters<StudyRepository['savePreset']>[0]) => study.savePreset(p),
  });
  const deletePreset = useMutation({
    mutationFn: (id: string) => study.deletePreset(id),
  });
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
      const p = await savePreset.mutateAsync({ name, replaces: null, config: { ...from } });
      setSelected({ kind: 'user', id: p.id });
    });
  };
  const renamePreset = (name: string) => {
    // Only a user's preset (which has its row) is editable.
    /* v8 ignore next */
    if (choice.ref.kind !== 'user' || !choice.row) return;
    const row = choice.row;
    void run(() =>
      savePreset.mutateAsync({ id: row.id, name, replaces: null, config: row.config }),
    );
  };
  const removePreset = () => {
    setRemoving(false);
    // «Remover» is disabled on an author's preset.
    /* v8 ignore next */
    if (choice.ref.kind !== 'user' || !choice.row) return;
    const id = choice.row.id;
    void run(async () => {
      await deletePreset.mutateAsync(id);
      setSelected(choices[0]!.ref);
    });
  };
  const backToAuthor = () => {
    // The menu offers it only on an author's preset the user changed.
    /* v8 ignore next */
    if (choice.ref.kind !== 'author' || !choice.row) return;
    const id = choice.row.id;
    void run(async () => {
      await deletePreset.mutateAsync(id);
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
