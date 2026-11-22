// Tests, over the users database (the Supabase adapters on the real SQL, PGlite), that what is studied or answered in the
// admin mode is saved as in the student mode, except what only the draft has, which changes no row.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@qv/db-types/users';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import { createDatabase } from '@qv/db/testing';
import { DATABASE_TIMEOUT } from '../../../test/contract';
import { toggleAdminMode } from '../../../test/adminMode';
import { cardText } from '../../../test/dom';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { QUIZ } from '../../../test/fixtures/quiz';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';
import { defaultPreferences, supabaseStudyRepository } from '../../progress/api/repository';
import { supabaseQuizRepository } from '../../quiz/api/repository';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;

beforeAll(async () => {
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);

const QUIZ_PATH = '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every row of every table of the users database, as the database holds them. */
async function dump() {
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
  );
  const rows: Record<string, string[]> = {};
  for (const { table_name } of tables.rows) {
    const r = await db.query<{ row: string }>(
      `select t::text as row from public."${table_name}" t order by 1`,
    );
    rows[table_name] = r.rows.map((x) => x.row);
  }
  return rows;
}

async function student(email: string) {
  const me = await signIn(db, email);
  const rest = fakeSupabase(db, () => me);
  const client = createClient<Database>(rest.url, rest.key, rest.options);
  const study = supabaseStudyRepository(client);
  await study.savePreferences({
    ...defaultPreferences(ZONE),
    fullAnki: true,
    fourButtons: true,
    welcomeSeen: true,
  });
  await study.setDeckActivation('5', true);
  return { study, quiz: supabaseQuizRepository(client) };
}

/** Answers the first card of the test deck and the first question of the test. */
async function answerSomething(op: { study: ReturnType<typeof supabaseStudyRepository> }) {
  const study = renderApp(`${DECK_PATH}/study`, { ...op, ...ADMIN });
  expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
  await userEvent.keyboard(' ');
  await cardText(/Reverso/);
  await userEvent.keyboard('3');
  expect(await cardText(/Frente/)).toContain('La columna tiene');
  study.unmount();
}

const ADMIN = { admin: localAdminRepository({ admin: true }), adminApi: fakeApi() };
const DRAFT_ONLY = {
  admin: localAdminRepository({ admin: true }),
  adminApi: fakeApi({
    catalog: async () => ({
      ...CATALOG,
      adminOnly: { 'deck:20': ['draft'], [`quiz:${QUIZ.id}`]: ['draft'] },
    }),
  }),
};

async function answerQuiz(op: { quiz: ReturnType<typeof supabaseQuizRepository> }) {
  const quiz = renderApp(QUIZ_PATH, { ...op, ...ADMIN });
  await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
  const options = await screen.findByRole('list', { name: 'Alternativas' });
  await userEvent.click(within(options).getByRole('button', { name: /Splicing alternativo/ }));
  await screen.findByRole('button', { name: /^(Siguiente|Ver resultado)$/ });
  quiz.unmount();
}

/** The saves of a session go out a moment after the answer: waits for them before the database is read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

describe('the admin mode and the users database', () => {
  it('studying a card and answering a test of what the students have is saved, as a student’s', async () => {
    const real = await student('admin-modo@ug.uchile.cl');
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const before = await dump();

    await answerSomething(real);
    await waitFor(async () => expect((await dump()).review_log).not.toEqual(before.review_log), {
      timeout: 3000,
    });
    await answerQuiz(real);
    await waitFor(
      async () => expect((await dump()).quiz_answers).not.toEqual(before.quiz_answers),
      { timeout: 3000 },
    );
  });

  it('what only the draft has is looked at: no study, no test, and no row changes', async () => {
    const real = await student('borrador-modo@ug.uchile.cl');
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const before = await dump();

    const study = renderApp(`${DECK_PATH}/study`, { ...real, ...DRAFT_ONLY });
    expect(await screen.findByText('Esto solo está en el borrador')).toBeInTheDocument();
    expect(screen.queryByText(/¿Cuántas vértebras/)).toBeNull();
    study.unmount();

    const quiz = renderApp(QUIZ_PATH, { ...real, ...DRAFT_ONLY });
    expect(await screen.findByText('Esto solo está en el borrador')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comenzar' })).toBeNull();
    quiz.unmount();
    await settle();

    expect(await dump()).toEqual(before);
  });

  it('switching to the admin mode and back, over and over, changes no row', async () => {
    const real = await student('ida-y-vuelta@ug.uchile.cl');
    const app = renderApp('/home', { ...real, ...ADMIN });
    await screen.findByRole('heading', { name: /Hola/ });
    await settle();
    const before = await dump();

    for (let i = 0; i < 2; i++) {
      await toggleAdminMode();
      await screen.findByText(/^Modo admin: ves el borrador/);
      await toggleAdminMode();
      await waitFor(() => expect(screen.queryByText(/^Modo admin: ves el borrador/)).toBeNull());
      await screen.findByRole('heading', { name: /Hola/ });
    }
    await settle();
    app.unmount();

    expect(await dump()).toEqual(before);
  });

  it('the student mode saves too: nothing above was a database that does not write', async () => {
    const real = await student('estudiante-modo@ug.uchile.cl');
    window.localStorage.setItem('qv-admin-mode', 'student');
    const before = await dump();

    await answerSomething(real);
    await waitFor(async () => expect((await dump()).review_log).not.toEqual(before.review_log), {
      timeout: 3000,
    });
  });
});
