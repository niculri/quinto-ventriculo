-- Plan step 1.3 (A2 of docs/plan/areas/publicacion-y-anuncios.md): cards that move to another deck or are taken out.
--
-- Each student's progress (the users' database) points to a card by (note_guid, ord) and keeps the deck the card
-- was in when they answered it; the web reads it by that deck. When the author moves a card (to «Extras», say) or
-- takes it out, that deck no longer says the truth. This database is the one that knows: it remembers the last
-- thing that happened to each card that moved, left or came back, with an increasing number, and the web takes
-- what is new for it to the users' database when the student enters (reconcile_cards() there).
--
-- Publishing never writes in anybody's progress: this only records what happened to the content.
-- Additive: no table or function of before changes.

create sequence public.anki_card_change_seq;
-- The numbers start at the time this database was made (milliseconds since 1970): a content database made again
-- later numbers its changes after any cursor a student kept from the one before, so they all come again (applying
-- one again is harmless: each says what is true now).
select setval('public.anki_card_change_seq', (extract(epoch from clock_timestamp()) * 1000)::bigint);

-- One row per card that ever moved, left or came back: where it is now (null: taken out) and when that happened.
-- A card published for the first time leaves none (nobody can have progress in it), so the table only grows with
-- what the author moves or takes out.
create table public.anki_card_changes (
  note_guid text not null,
  ord smallint not null,
  -- The deck it is in now; null if it is no longer published
  deck_id text,
  change_id bigint not null default nextval('public.anki_card_change_seq'),
  changed_at timestamptz not null default now(),
  primary key (note_guid, ord)
);
create index anki_card_changes_change on public.anki_card_changes (change_id);
alter table public.anki_card_changes enable row level security;
-- No policies and no privileges: only the trigger below writes it and only anki_card_changes_since() reads it.

-- Whatever writes the cards (save_anki_note, prune_anki, a hand-made fix), the change is recorded.
create function public.anki_card_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One writer of changes at a time, until it commits: the numbers then become visible in their order, and a
  -- student who read up to N never misses a smaller one that another transaction had taken but not committed.
  perform pg_advisory_xact_lock(hashtextextended('anki_card_changes', 0));
  if tg_op = 'INSERT' then
    -- Only a card that had moved or left before (it comes back): a new one needs nothing.
    update public.anki_card_changes
       set deck_id = new.deck_id, change_id = nextval('public.anki_card_change_seq'), changed_at = now()
     where note_guid = new.note_guid and ord = new.ord;
    return null;
  end if;
  insert into public.anki_card_changes as c (note_guid, ord, deck_id)
  values (
    case when tg_op = 'DELETE' then old.note_guid else new.note_guid end,
    case when tg_op = 'DELETE' then old.ord else new.ord end,
    case when tg_op = 'DELETE' then null else new.deck_id end)
  on conflict (note_guid, ord) do update set
    deck_id = excluded.deck_id, change_id = excluded.change_id, changed_at = excluded.changed_at;
  return null;
end;
$$;

create trigger anki_card_added after insert on public.anki_cards
  for each row execute function public.anki_card_changed();
create trigger anki_card_moved after update of deck_id on public.anki_cards
  for each row when (old.deck_id is distinct from new.deck_id)
  execute function public.anki_card_changed();
create trigger anki_card_removed after delete on public.anki_cards
  for each row execute function public.anki_card_changed();

-- The changes after `since`, in order, at most `max_rows` (≤ 5,000): { changes: [{ noteGuid, ord, deckId }],
-- next (where the next page starts: the last change given, or `since`), latest (the newest of all), more }.
-- Each card is there once, with what is true now. For the API (service_role).
create function public.anki_card_changes_since(since bigint, max_rows integer default 2000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(max_rows, 2000), 1), 5000);
  page jsonb;
  last_id bigint;
  more boolean;
begin
  with rows as (
    select c.note_guid, c.ord, c.deck_id, c.change_id
      from public.anki_card_changes c
     where c.change_id > coalesce(since, 0)
     order by c.change_id
     limit n + 1
  ), firsts as (
    select * from rows order by change_id limit n
  )
  select coalesce(jsonb_agg(jsonb_build_object('noteGuid', f.note_guid, 'ord', f.ord, 'deckId', f.deck_id)
                            order by f.change_id), '[]'::jsonb),
         max(f.change_id),
         (select count(*) from rows) > n
    into page, last_id, more
    from firsts f;
  return jsonb_build_object(
    'changes', page,
    'next', coalesce(last_id, coalesce(since, 0)),
    'latest', coalesce((select max(c.change_id) from public.anki_card_changes c), 0),
    'more', more);
end;
$$;

revoke all on public.anki_card_changes from public;
revoke all on sequence public.anki_card_change_seq from public;
revoke all on function public.anki_card_changed() from public;
revoke all on function public.anki_card_changes_since(bigint, integer) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.anki_card_changes from anon, authenticated;
    revoke all on sequence public.anki_card_change_seq from anon, authenticated;
    revoke all on function public.anki_card_changed() from anon, authenticated;
    revoke all on function public.anki_card_changes_since(bigint, integer) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- The API reads through the function; nobody writes the table by hand.
    revoke all on public.anki_card_changes from service_role;
    revoke all on sequence public.anki_card_change_seq from service_role;
    revoke all on function public.anki_card_changed() from service_role;
    grant execute on function public.anki_card_changes_since(bigint, integer) to service_role;
  end if;
end $$;
