-- v1.6: the simple Anki, the default way of studying (docs/v1/BRIEF-1.6.md). The scheduler does not change: this
-- is what each student chooses and what the web tells the scheduler from it. Same rules as the study tables: RLS
-- (each user only their own rows, and only @ug.uchile.cl), default privileges revoked, functions with
-- search_path = ''.

-- «Modo Anki completo» (everything as Anki, as before this version), «Mostrar los 4 botones» and the welcome the
-- student already closed.
alter table public.study_preferences
  add column full_anki boolean not null default false,
  add column four_buttons boolean not null default false,
  add column welcome_seen boolean not null default false;

-- A week or a lecture (the deck under an assessment's) the student turned on or off by hand. Without a row, it
-- counts as on if they already answered a card of it (answered_decks()), so nobody who studied loses anything.
create table public.deck_activations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id text not null check (deck_id ~ '^[0-9]{1,20}$'),
  active boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

-- What the student chose for an assessment (by the id of its deck): «Incluir extras» and new cards a day (null:
-- the site's default).
create table public.assessment_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id text not null check (deck_id ~ '^[0-9]{1,20}$'),
  include_extras boolean not null default false,
  new_per_day smallint check (new_per_day between 0 and 9999),
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

-- The decks where the user answered at least one card (a card only buried or flagged does not count, nor one
-- forgotten with its counts reset).
-- The caller's rights and RLS: only their own rows.
create function public.answered_decks()
returns table (deck_id text)
language sql
stable
set search_path = ''
as $$
  select distinct s.deck_id
    from public.card_states s
   where s.user_id = auth.uid() and (s.phase <> 'new' or s.reps > 0);
$$;

-- How long the user takes on a card: the median of their last 500 answers, in milliseconds. Null with fewer
-- than 20 answers (the web then uses its default).
create function public.median_answer_ms()
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when count(*) >= 20 then (percentile_cont(0.5) within group (order by recent.duration_ms))::integer
         end
    from (
      select l.duration_ms
        from public.review_log l
       where l.user_id = auth.uid() and l.rating is not null and l.duration_ms is not null
       order by l.id desc
       limit 500
    ) recent;
$$;

alter table public.deck_activations enable row level security;
alter table public.assessment_settings enable row level security;

create policy "own deck activations" on public.deck_activations
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "own assessment settings" on public.assessment_settings
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

revoke all on public.deck_activations, public.assessment_settings from public;
revoke execute on function public.answered_decks(), public.median_answer_ms() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.deck_activations, public.assessment_settings from anon, authenticated;
    revoke execute on function public.answered_decks(), public.median_answer_ms() from anon, authenticated;
    grant select, insert, update, delete on public.deck_activations, public.assessment_settings to authenticated;
    grant execute on function public.answered_decks(), public.median_answer_ms() to authenticated;
  end if;
end $$;
