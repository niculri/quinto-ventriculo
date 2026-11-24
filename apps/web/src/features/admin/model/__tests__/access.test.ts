// Tests who is chosen to move in «Acceso», and how a move is undone, without React.
import { describe, expect, it } from 'vitest';
import type { AccessInvite } from '../../api/repository';
import { chosenInvites, listChoiceState, undoMoves, withChosen } from '../access';

const person = (email: string): AccessInvite => ({
  email,
  list: 'Curso',
  note: null,
  invitedBy: null,
  invitedAt: '2026-11-01T12:00:00.000Z',
  admin: false,
  hasAccount: false,
  lastSeenAt: null,
});
const COURSE = ['a', 'b', 'c'].map((x) => person(`${x}@ug.uchile.cl`));

describe('who is chosen, without React', () => {
  const people = COURSE;

  it('a list is all, some or none chosen', () => {
    expect(listChoiceState(people, new Set())).toBe('none');
    expect(listChoiceState(people, new Set([people[0]!.email]))).toBe('some');
    expect(listChoiceState(people, new Set(people.map((p) => p.email)))).toBe('all');
  });

  it('adding and taking out, and only who is still invited, in the report’s order', () => {
    const chosen = withChosen(
      new Set(['fuera@ug.uchile.cl']),
      [people[2]!.email, people[0]!.email],
      true,
    );
    expect(chosenInvites(people, chosen)).toEqual([people[0]!.email, people[2]!.email]);
    expect([...withChosen(chosen, [people[0]!.email], false)]).not.toContain(people[0]!.email);
  });

  it('undoing sends each one back to the list they left', () => {
    expect(
      undoMoves([
        { email: 'a@ug.uchile.cl', from: 'Curso', to: 'Equipo' },
        { email: 'b@ug.uchile.cl', from: 'Otra', to: 'Equipo' },
      ]),
    ).toEqual([
      { email: 'a@ug.uchile.cl', list: 'Curso' },
      { email: 'b@ug.uchile.cl', list: 'Otra' },
    ]);
  });
});
