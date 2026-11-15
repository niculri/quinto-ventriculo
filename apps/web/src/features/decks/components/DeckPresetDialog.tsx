// «Modo avanzado»: a deck's button and dialog to choose which configuration (preset) it uses.

import { useId, useState } from 'react';
import { Link } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { Settings, SlidersHorizontal, X } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { Notice } from '../../../shared/ui/Notice';
import { Select } from '../../../shared/ui/Select';
import { button } from '../../../shared/ui/styles';
import { presetParam } from '../../progress/presets';
import type { DeckNode } from '../../catalog/model/tree';
import { DimBackdrop } from '../../../shared/ui/Dialog';
import { useDeckPreset } from '../hooks/useDeckPreset';
import { refKey } from '../model/presets';
import { presetsStrings as p } from '../presets.strings';

export function DeckPresetButton({ node }: { node: DeckNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={`${button.base} ${button.ghost} flex-none px-2`}
        aria-label={p.deckPreset.open(node.label)}
        title={p.deckPreset.openTitle}
      >
        <Settings className="size-4" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <DimBackdrop />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-semibold">{p.deckPreset.title(node.label)}</Dialog.Title>
            <Dialog.Close
              className={`${button.base} ${button.ghost} px-2`}
              aria-label={p.deckPreset.close}
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-xs text-muted">
            {p.deckPreset.shared}
          </Dialog.Description>
          {open ? <PresetChoice node={node} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PresetChoice({ node }: { node: DeckNode }) {
  const id = useId();
  const preset = useDeckPreset(node);
  if (!preset) return <Skeleton className="mt-4 h-20 w-full" />;
  const { choices, current, error, saving, choose } = preset;

  return (
    <>
      <label htmlFor={id} className="mt-4 block text-sm font-medium">
        {p.deckPreset.choice}
      </label>
      <Select
        id={id}
        modal
        label={p.deckPreset.choice}
        value={refKey(current.ref)}
        disabled={saving}
        options={choices.map((c) => ({
          value: refKey(c.ref),
          label: p.presetName(c.name, c.ref.kind === 'author', !!c.row),
        }))}
        onChange={(v) => void choose(v)}
        className="mt-1 w-full"
      />
      <Link
        to={paths.deckOptions({ preset: presetParam(current.ref) })}
        className={`${button.base} ${button.secondary} mt-4 w-full`}
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" /> {p.deckPreset.edit}
      </Link>
      {error ? (
        <div className="mt-3">
          <Notice title={p.deckPreset.failed}>{error}</Notice>
        </div>
      ) : null}
    </>
  );
}
