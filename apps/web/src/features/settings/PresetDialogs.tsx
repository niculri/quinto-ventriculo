import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Pencil, X } from 'lucide-react';
import { button, card } from '../../ui/styles';

const frame =
  'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-soft';
const field =
  'w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

/** A name that says what is wrong with it, or null. */
export type NameCheck = (name: string) => string | null;

/** The name of a new configuration. */
export function PresetNameDialog({
  title,
  initial,
  check,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: string;
  check: NameCheck;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    const wrong = check(clean);
    if (wrong) setProblem(wrong);
    else onSubmit(clean);
  };
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className={frame} aria-describedby={undefined}>
          <Dialog.Title className="font-semibold">{title}</Dialog.Title>
          <form onSubmit={submit} className="mt-3">
            <label htmlFor={id} className="text-sm font-medium">
              Nombre
            </label>
            <input
              id={id}
              value={name}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                setName(e.target.value);
                setProblem(null);
              }}
              maxLength={80}
              className={`${field} mt-1`}
            />
            <p role="alert" className="mt-1 min-h-5 text-xs text-state-learn">
              {problem}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className={`${button.base} ${button.secondary}`}
              >
                Cancelar
              </button>
              <button type="submit" className={`${button.base} ${button.primary}`}>
                Crear
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Whether to remove a configuration. */
export function RemovePresetDialog({
  name,
  users,
  onCancel,
  onConfirm,
}: {
  name: string;
  users: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className={frame}>
          <Dialog.Title className="font-semibold">¿Remover {name}?</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            {users
              ? `La ${users === 1 ? 'usa 1 mazo, que vuelve' : `usan ${users} mazos, que vuelven`} a la suya.`
              : 'Ningún mazo la usa.'}
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={`${button.base} ${button.secondary}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`${button.base} ${button.primary}`}
            >
              Remover
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The name of the configuration open, under its dropdown: read only until its button turns on the editing. The author's
 * cannot be renamed. The caller gives it a `key` per configuration: changing to another one starts over.
 */
export function PresetNameField({
  name,
  editable,
  check,
  onRename,
}: {
  name: string;
  editable: boolean;
  check: NameCheck;
  onRename: (name: string) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const cancel = () => {
    setEditing(false);
    setText(name);
    setProblem(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (clean === name) return cancel();
    const wrong = check(clean);
    if (wrong) return setProblem(wrong);
    setEditing(false);
    setProblem(null);
    onRename(clean);
  };
  const iconButton = `${button.base} ${button.secondary} flex-none px-2.5`;
  return (
    <form onSubmit={submit} className={`${card} mt-3 p-3`}>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={id} className="flex-none font-medium">
          Nombre
        </label>
        <input
          id={id}
          value={text}
          readOnly={!editing}
          autoFocus={editing}
          maxLength={80}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && editing) cancel();
          }}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${
            editing
              ? 'border-border bg-surface focus:border-brand'
              : 'border-transparent bg-surface-2 text-muted'
          }`}
        />
        {editing ? (
          <>
            <button type="submit" aria-label="Guardar el nombre" className={iconButton}>
              <Check className="size-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Cancelar" onClick={cancel} className={iconButton}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Editar el nombre"
            title={editable ? 'Editar el nombre' : 'Las configuraciones del autor no se renombran'}
            disabled={!editable}
            onClick={() => setEditing(true)}
            className={`${iconButton} disabled:cursor-default disabled:opacity-50`}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p role="alert" className={`mt-1 text-xs ${problem ? 'text-state-learn' : 'text-muted'}`}>
        {problem ??
          (editable
            ? 'Usa el lápiz para cambiarle el nombre.'
            : 'Las del autor no se renombran; clónala para tener una con otro nombre.')}
      </p>
    </form>
  );
}
