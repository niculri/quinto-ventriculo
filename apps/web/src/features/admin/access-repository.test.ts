import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AccessError, supabaseAdminRepository } from './repository';

/**
 * Revisión de cero (2.10): «Acceso» against the users' database, as the web calls it — the names of the functions and
 * of their argument (`p`, as in …_admin_access.sql), what the panel makes of their answers (snake_case → the page's
 * names) and of their refusals, in Spanish. The SQL itself is db/tests/admin-access.test.ts.
 */

type Rpc = (fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>;

const clientWith = (rpc: Rpc) => {
  const spy = vi.fn(rpc);
  return { client: { rpc: spy } as unknown as SupabaseClient, spy };
};

const refused =
  (code: string, message: string): Rpc =>
  async () => ({
    data: null,
    error: { code, message, details: null, hint: null },
  });

describe('supabaseAdminRepository: «Acceso»', () => {
  it('reads admin_access_report() and gives it the page’s names', async () => {
    const { client, spy } = clientWith(async () => ({
      data: {
        open_to_domain: false,
        lists: [{ list: 'Curso de prueba', invited: 2, with_account: 1 }],
        invited: [
          {
            email: 'ana.perez@ug.uchile.cl',
            list: 'Curso de prueba',
            note: 'Primera tanda',
            invited_by: 'dueno@ug.uchile.cl',
            invited_at: '2026-11-01T12:00:00.123456+00:00',
            admin: false,
            has_account: true,
            last_sign_in_at: '2026-11-07T15:30:00+00:00',
          },
        ],
        accounts_without_invite: [
          {
            email: 'perdida@ug.uchile.cl',
            created_at: '2026-11-02T10:00:00+00:00',
            last_sign_in_at: null,
          },
        ],
      },
      error: null,
    }));
    const r = await supabaseAdminRepository(client).accessReport();
    expect(spy).toHaveBeenCalledWith('admin_access_report');
    expect(r).toEqual({
      openToDomain: false,
      lists: [{ list: 'Curso de prueba', invited: 2, withAccount: 1 }],
      invited: [
        {
          email: 'ana.perez@ug.uchile.cl',
          list: 'Curso de prueba',
          note: 'Primera tanda',
          invitedBy: 'dueno@ug.uchile.cl',
          invitedAt: '2026-11-01T12:00:00.123456+00:00',
          admin: false,
          hasAccount: true,
          lastSignInAt: '2026-11-07T15:30:00+00:00',
        },
      ],
      accountsWithoutInvite: [
        {
          email: 'perdida@ug.uchile.cl',
          createdAt: '2026-11-02T10:00:00+00:00',
          lastSignInAt: null,
        },
      ],
    });
  });

  it('invites with { p: { emails, list, note } } and never sends who invites (the database takes it from the token)', async () => {
    const { client, spy } = clientWith(async () => ({
      data: {
        added: 1,
        already: 1,
        rejected: [{ email: 'otro@gmail.com', reason: 'domain' }],
        added_emails: ['nueva@ug.uchile.cl'],
        already_emails: ['ana.perez@ug.uchile.cl'],
      },
      error: null,
    }));
    const repo = supabaseAdminRepository(client);
    expect(
      await repo.invite({
        emails: ['nueva@ug.uchile.cl', 'ana.perez@ug.uchile.cl', 'otro@gmail.com'],
        list: 'Medicina 2027',
        note: null,
      }),
    ).toEqual({
      added: ['nueva@ug.uchile.cl'],
      already: ['ana.perez@ug.uchile.cl'],
      rejected: [{ email: 'otro@gmail.com', reason: 'domain' }],
    });
    expect(spy).toHaveBeenLastCalledWith('admin_invite_emails', {
      p: {
        emails: ['nueva@ug.uchile.cl', 'ana.perez@ug.uchile.cl', 'otro@gmail.com'],
        list: 'Medicina 2027',
      },
    });
    await repo.invite({ emails: ['x@ug.uchile.cl'], list: 'Equipo', note: 'Ayudante' });
    expect(spy).toHaveBeenLastCalledWith('admin_invite_emails', {
      p: { emails: ['x@ug.uchile.cl'], list: 'Equipo', note: 'Ayudante' },
    });
  });

  it('removes a person or a list, with only that key (never include_admins)', async () => {
    const { client, spy } = clientWith(async () => ({
      data: {
        removed: ['ayudante@ug.uchile.cl'],
        not_invited: [],
        kept_admins: ['dueno@ug.uchile.cl'],
        sessions_closed: 2,
        open_to_domain: false,
      },
      error: null,
    }));
    const repo = supabaseAdminRepository(client);
    expect(await repo.removeInvites({ list: 'Equipo' })).toEqual({
      removed: ['ayudante@ug.uchile.cl'],
      notInvited: [],
      keptAdmins: ['dueno@ug.uchile.cl'],
      sessionsClosed: 2,
      openToDomain: false,
    });
    expect(spy).toHaveBeenLastCalledWith('admin_remove_invites', { p: { list: 'Equipo' } });
    await repo.removeInvites({ emails: ['ayudante@ug.uchile.cl'] });
    expect(spy).toHaveBeenLastCalledWith('admin_remove_invites', {
      p: { emails: ['ayudante@ug.uchile.cl'] },
    });
  });

  it('says each refusal of the database in Spanish', async () => {
    const cases: [Rpc, string][] = [
      [refused('28000', 'session_closed'), 'Tu sesión se cerró. Sal y vuelve a entrar.'],
      [refused('42501', 'admin_only'), 'Solo para administradores.'],
      [
        refused('P0002', 'remove_invites: there is no list named «Equipo»'),
        'Esa lista ya no existe. Recarga la página.',
      ],
      [
        refused('22023', 'invite_emails: at most 500 emails per call'),
        'A lo más 500 correos por vez.',
      ],
      [
        refused('22023', 'invite_emails: "list" is required (1 to 60 characters)'),
        'El nombre de la lista tiene que tener entre 1 y 60 letras.',
      ],
      [
        refused('22023', 'invite_emails: "note" has at most 200 characters'),
        'La nota tiene a lo más 200 letras.',
      ],
      // A shape the panel never sends: not a word about the list's name.
      [
        refused('22023', 'admin_invite_emails: expected { "emails": [...], "list": "…" }'),
        'No se pudo. Revisa tu conexión e intenta de nuevo.',
      ],
      [
        async () => ({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' } }),
        'No se pudo. Revisa tu conexión e intenta de nuevo.',
      ],
    ];
    for (const [rpc, said] of cases) {
      const repo = supabaseAdminRepository(clientWith(rpc).client);
      const e = await repo
        .invite({ emails: ['x@ug.uchile.cl'], list: 'L', note: null })
        .catch((x) => x);
      expect(e).toBeInstanceOf(AccessError);
      expect((e as Error).message).toBe(said);
    }
    for (const call of [
      (r: ReturnType<typeof supabaseAdminRepository>) => r.accessReport(),
      (r: ReturnType<typeof supabaseAdminRepository>) => r.removeInvites({ list: 'L' }),
    ]) {
      const repo = supabaseAdminRepository(clientWith(refused('42501', 'admin_only')).client);
      await expect(call(repo)).rejects.toThrow('Solo para administradores.');
    }
  });
});
