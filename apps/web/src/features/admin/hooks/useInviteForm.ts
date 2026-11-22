// The state of «Invitar»: what is pasted, the list, the note, what can be sent, and what the invitation did.
import { useMemo, useState } from 'react';
import { MAX_EMAILS } from '../api/repository';
import type { InviteResult } from '../api/repository';
import { NEW_LIST, listChoice } from '../model/access';
import { readEmails } from '../model/emails';
import { useInviteFormStrings as s } from './strings/useInviteForm.strings';
import { useInvite } from './useAccess';
import { accessFailure } from './accessFailure';

export function useInviteForm(lists: string[]) {
  const invite = useInvite();
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string>(NEW_LIST);
  const [newName, setNewName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ list: string; result: InviteResult } | null>(null);
  const { chosen, names } = useMemo(() => listChoice(lists, choice), [lists, choice]);
  const { emails, ignored } = useMemo(() => readEmails(text), [text]);
  const list = (chosen ?? newName).trim();
  const tooMany = emails.length > MAX_EMAILS;
  const ready = emails.length > 0 && !tooMany && list.length >= 1 && list.length <= 60;
  const status = invite.isError
    ? accessFailure(invite.error)
    : tooMany
      ? s.form.tooMany(emails.length, MAX_EMAILS)
      : emails.length || ignored
        ? s.form.count(emails.length, ignored)
        : '';
  const submit = () => {
    if (!ready || invite.isPending) return;
    invite.mutate(
      { emails, list, note: note.trim() || null },
      {
        onSuccess: (r) => {
          setResult({ list, result: r });
          setText('');
          setNote('');
          setNewName('');
          setChoice(`list:${list}`);
        },
      },
    );
  };
  return {
    invite,
    text,
    setText,
    choice,
    setChoice,
    newName,
    setNewName,
    note,
    setNote,
    result,
    closeResult: () => setResult(null),
    names,
    tooMany,
    ready,
    status,
    submit,
  };
}
