// The state of «Mover a otra lista»: the list chosen (one of them or a new one), moving the chosen people, undoing the
// last move at once, and the toast of what was done.
import { useEffect, useState } from 'react';
import type { AccessReport, MoveResult } from '../api/repository';
import { NEW_LIST, chosenInvites, listChoice, undoMoves } from '../model/access';
import { useMoveBarStrings as s } from './strings/useMoveBar.strings';
import { useMoveInvites } from './useAccess';
import { accessFailure } from './accessFailure';

const TOAST_MS = 4000;

export function useMoveBar(
  report: AccessReport,
  chosen: ReadonlySet<string>,
  clearChosen: () => void,
) {
  const move = useMoveInvites();
  const lists = report.lists.map((l) => l.list);
  const [choice, setChoice] = useState(() => (lists[0] ? `list:${lists[0]}` : NEW_LIST));
  const [newName, setNewName] = useState('');
  const [last, setLast] = useState<MoveResult['moved'] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { chosen: existing, names } = listChoice(lists, choice);
  const list = (existing ?? newName).trim();
  const emails = chosenInvites(report.invited, chosen);
  const ready = emails.length > 0 && list.length >= 1 && list.length <= 60 && !move.isPending;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const submit = () => {
    if (!ready) return;
    move.mutate(
      emails.map((email) => ({ email, list })),
      {
        onSuccess: (r) => {
          setLast(r.moved.length ? r.moved : null);
          setToast(s.moved(r.moved.length, list));
          clearChosen();
          setNewName('');
          setChoice(`list:${list}`);
        },
      },
    );
  };
  const undo = () => {
    if (!last || move.isPending) return;
    move.mutate(undoMoves(last), {
      onSuccess: (r) => {
        setLast(null);
        setToast(s.undone(r.moved.length));
      },
    });
  };
  return {
    count: emails.length,
    choice,
    setChoice,
    newName,
    setNewName,
    names,
    ready,
    busy: move.isPending,
    error: move.isError ? accessFailure(move.error) : null,
    canUndo: last !== null && !move.isPending,
    submit,
    undo,
    toast,
  };
}
