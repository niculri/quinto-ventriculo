import { useId, useState } from 'react';
import { Link } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Settings, SlidersHorizontal, X } from 'lucide-react';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { Skeleton } from '../../ui/Loading';
import { Notice } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { button } from '../../ui/styles';
import { useCatalog } from '../catalog/queries';
import { studyKeys, useDeckSettings, useUserPresets } from '../study/queries';
import { presetChoices, presetOf } from '../study/scheduler';
import type { PresetRef } from '../study/scheduler';
import { presetParam } from './presets';
import type { DeckNode } from './tree';

/**
 * «Modo avanzado»: the button of a deck that opens which configuration it uses. Choosing one saves it; to change one or
 * to make a new one, «Configuración de mazos».
 */
export function DeckPresetButton({ node }: { node: DeckNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={`${button.base} ${button.ghost} flex-none px-2`}
        aria-label={`Configuración de ${node.label}`}
        title="Configuración del mazo"
      >
        <Settings className="size-4" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-semibold">Configuración de {node.label}</Dialog.Title>
            <Dialog.Close className={`${button.base} ${button.ghost} px-2`} aria-label="Cerrar">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-xs text-muted">
            Una configuración se comparte: cambiarla cambia todos los mazos que la usan.
          </Dialog.Description>
          {open ? <PresetChoice node={node} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PresetChoice({ node }: { node: DeckNode }) {
  const id = useId();
  const { study } = useServices();
  const client = useQueryClient();
  const catalog = useCatalog();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!catalog.data || !presets.data || !settings.data) {
    return <Skeleton className="mt-4 h-20 w-full" />;
  }
  const choices = presetChoices(catalog.data.anki.presets, presets.data);
  const current = presetOf(node.id, node.preset, choices, settings.data);
  const key = (r: PresetRef) => (r.kind === 'author' ? `author:${r.name}` : `user:${r.id}`);

  const choose = async (value: string) => {
    const choice = choices.find((c) => key(c.ref) === value);
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      await study.setDeckPreset(
        node.id,
        choice.ref.kind === 'user'
          ? { presetId: choice.ref.id }
          : choice.ref.name === node.preset
            ? null
            : { authorPreset: choice.ref.name },
      );
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <label htmlFor={id} className="mt-4 block text-sm font-medium">
        Configuración de este mazo
      </label>
      <Select
        id={id}
        modal
        label="Configuración de este mazo"
        value={key(current.ref)}
        disabled={saving}
        options={choices.map((c) => ({
          value: key(c.ref),
          label: `${c.name}${c.ref.kind === 'author' ? (c.row ? ' (del autor, cambiada)' : ' (del autor)') : ''}`,
        }))}
        onChange={(v) => void choose(v)}
        className="mt-1 w-full"
      />
      <Link
        to={paths.deckOptions({ preset: presetParam(current.ref) })}
        className={`${button.base} ${button.secondary} mt-4 w-full`}
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" /> Editar o crear configuraciones
      </Link>
      {error ? (
        <div className="mt-3">
          <Notice title="No se pudo cambiar">{error}</Notice>
        </div>
      ) : null}
    </>
  );
}
