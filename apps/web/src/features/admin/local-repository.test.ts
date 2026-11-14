// Pins the rules that the in-memory administration repository re-implements from invite_emails(), remove_invites()
// and admin_set_admin(). Above each test, the db/tests case that checks the same rule in SQL («db: none» when there is
// none); «differs» marks a behaviour that is not the database's.
import { describe, expect, it } from 'vitest';
import { localAdminRepository, MAX_EMAILS } from './repository';
import type { AccessInvite } from './repository';

const person = (email: string, list: string, admin = false): AccessInvite => ({
  email,
  list,
  note: null,
  invitedBy: null,
  invitedAt: '2026-03-01T12:00:00.000Z',
  admin,
  hasAccount: true,
  lastSignInAt: null,
});

const people = () => [
  person('dueno@ug.uchile.cl', 'Equipo', true),
  person('ana.perez@ug.uchile.cl', 'Curso', false),
  person('beto.soto@ug.uchile.cl', 'Curso', false),
];

const repo = (over: Parameters<typeof localAdminRepository>[0] = {}) =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', invites: people(), ...over });

describe('who can use it', () => {
  // db: admin-access.test.ts › a student gets admin_only, and nothing changes
  it('only an administrator', async () => {
    const student = repo({ admin: false });
    expect(await student.isAdmin()).toBe(false);
    await expect(student.accessReport()).rejects.toThrow('Solo para administradores.');
    await expect(
      student.invite({ emails: ['x@ug.uchile.cl'], list: 'L', note: null }),
    ).rejects.toThrow('Solo para administradores.');
    await expect(student.removeInvites({ emails: ['ana.perez@ug.uchile.cl'] })).rejects.toThrow(
      'Solo para administradores.',
    );
    await expect(
      student.setAdmin({ email: 'ana.perez@ug.uchile.cl', admin: true }),
    ).rejects.toThrow('Solo para administradores.');
  });
});

describe('inviting', () => {
  // db: invite-lists.test.ts › normalizes, rejects another domain and what is repeated, and adds the rest to its list;
  // › whoever was already there keeps their list and date
  it('normalizes, rejects another domain, what is not an email and what is repeated, and adds the rest', async () => {
    const admin = repo();
    const result = await admin.invite({
      emails: [
        ' Nueva.Persona@UG.uchile.cl​',
        'nueva.persona@ug.uchile.cl',
        'alguien@gmail.com',
        'mal(nombre)@ug.uchile.cl',
        '   ',
        'ana.perez@ug.uchile.cl',
      ],
      list: '  Curso nuevo ',
      note: '  ',
    });
    expect(result).toEqual({
      added: ['nueva.persona@ug.uchile.cl'],
      already: ['ana.perez@ug.uchile.cl'],
      rejected: [
        { email: 'nueva.persona@ug.uchile.cl', reason: 'repeated' },
        { email: 'alguien@gmail.com', reason: 'domain' },
        { email: 'mal(nombre)@ug.uchile.cl', reason: 'invalid' },
        { email: '   ', reason: 'empty' },
      ],
    });
    const report = await admin.accessReport();
    expect(report.invited.find((i) => i.email === 'nueva.persona@ug.uchile.cl')).toMatchObject({
      list: 'Curso nuevo',
      note: null,
      invitedBy: 'dueno@ug.uchile.cl',
      admin: false,
    });
    expect(report.invited.find((i) => i.email === 'ana.perez@ug.uchile.cl')).toMatchObject({
      list: 'Curso',
    });
  });

  // db: invite-lists.test.ts › needs the list and who loads it, and at most 500 per call
  it(`needs a list of 1 to 60 letters, and at most ${MAX_EMAILS} emails`, async () => {
    const admin = repo();
    await expect(
      admin.invite({ emails: ['x@ug.uchile.cl'], list: '  ', note: null }),
    ).rejects.toThrow();
    await expect(
      admin.invite({ emails: ['x@ug.uchile.cl'], list: 'L'.repeat(61), note: null }),
    ).rejects.toThrow();
    const many = Array.from({ length: MAX_EMAILS + 1 }, (_, i) => `p${i}@ug.uchile.cl`);
    await expect(admin.invite({ emails: many, list: 'L', note: null })).rejects.toThrow(
      `${MAX_EMAILS}`,
    );
  });

  // differs — db: invite_emails() refuses a note of more than 200 characters (no db test)
  it('takes a note of any length', async () => {
    const result = await repo().invite({
      emails: ['x@ug.uchile.cl'],
      list: 'L',
      note: 'n'.repeat(300),
    });
    expect(result.added).toEqual(['x@ug.uchile.cl']);
  });
});

describe('removing', () => {
  // db: invite-lists.test.ts › never removes an administrator without "include_admins": true; admin-access.test.ts ›
  // never removes an administrator, also when asked with include_admins
  it('never removes an administrator; says who was not invited', async () => {
    const admin = repo();
    const result = await admin.removeInvites({
      emails: ['DUENO@ug.uchile.cl', 'ana.perez@ug.uchile.cl', 'nadie@ug.uchile.cl'],
    });
    expect(result).toMatchObject({
      removed: ['ana.perez@ug.uchile.cl'],
      notInvited: ['nadie@ug.uchile.cl'],
      keptAdmins: ['dueno@ug.uchile.cl'],
      sessionsClosed: 1,
    });
    expect((await admin.accessReport()).invited.map((i) => i.email)).toEqual([
      'beto.soto@ug.uchile.cl',
      'dueno@ug.uchile.cl',
    ]);
  });

  // db: invite-lists.test.ts › by list: every one of it, with their sessions; admin-access.test.ts › a list that does
  // not exist, or both keys, are refused as remove_invites() refuses them
  it('a whole list at once; a list that does not exist is refused', async () => {
    const admin = repo();
    expect((await admin.removeInvites({ list: 'Curso' })).removed).toEqual([
      'ana.perez@ug.uchile.cl',
      'beto.soto@ug.uchile.cl',
    ]);
    await expect(admin.removeInvites({ list: 'Curso' })).rejects.toThrow('Esa lista ya no existe');
  });
});

describe('naming administrators', () => {
  // db: admin-owner.test.ts › names an invited person, however the email is written; › removes an administrator: they
  // stay invited, with their sessions, as a student
  it('the owner names and removes an invited person; asking again changes nothing', async () => {
    const owner = repo();
    expect(await owner.setAdmin({ email: ' ANA.perez@ug.uchile.cl', admin: true })).toEqual({
      email: 'ana.perez@ug.uchile.cl',
      admin: true,
      changed: true,
    });
    expect((await owner.setAdmin({ email: 'ana.perez@ug.uchile.cl', admin: true })).changed).toBe(
      false,
    );
    await owner.setAdmin({ email: 'ana.perez@ug.uchile.cl', admin: false });
    const ana = (await owner.accessReport()).invited.find(
      (i) => i.email === 'ana.perez@ug.uchile.cl',
    );
    expect(ana).toMatchObject({ admin: false, list: 'Curso' });
  });

  // db: admin-owner.test.ts › the report says it, and whether it is who is looking
  it('the report says who the owner is, only to the owner', async () => {
    expect(await repo().accessReport()).toMatchObject({
      owner: 'dueno@ug.uchile.cl',
      youAreOwner: true,
    });
    expect(await repo({ owner: false }).accessReport()).toMatchObject({
      owner: null,
      youAreOwner: false,
    });
  });
});
