-- Plan step 3.2 (the new home page, ESC-E1): the home page counts what is left today without downloading the decks.
-- From the users' database it gets, deck by deck, how much of each deck the student has seen; to know how many new
-- cards can come out (one a note a day: siblings are buried) it needs three figures of each deck that only the content
-- has:
--   * own_note_count: the notes with a card directly in the deck (not in a subdeck);
--   * exclusive_note_count: the notes whose cards are all directly in the deck (a note with a card in its «Extras»
--     is not one of them);
--   * closed_note_count: the notes with a card directly in the deck and every card in it or below it (a note with a
--     card in the deck and another in its «Extras» is one of them).
-- anki_deck_tree() gives them besides what it gave. Its columns change, so it is dropped and made again with the same
-- privileges; the Worker that is published reads its columns by name and does not know the new ones (they are optional
-- in the catalog).

drop function public.anki_deck_tree();

-- Every deck of the tree with the notes and cards of its subtree (Anki's deck list), parents first, and its own notes.
create function public.anki_deck_tree()
returns table (
  id text,
  name text,
  parent text,
  preset text,
  semester smallint,
  course_id text,
  assessment_id text,
  note_count integer,
  card_count integer,
  own_note_count integer,
  exclusive_note_count integer,
  closed_note_count integer
)
language sql
stable
set search_path = ''
as $$
  with recursive tree (root, id) as (
    select d.id, d.id from public.anki_decks d
    union all
    select t.root, c.id from tree t join public.anki_decks c on c.parent = t.id
  ),
  -- The cards directly in each deck.
  cards as (
    select k.deck_id as id, count(*)::integer as cards
      from public.anki_cards k
     group by k.deck_id
  ),
  -- Each note with the first and the last deck of its cards. Most are in one deck (the same): only the others are
  -- looked at deck by deck.
  notes as (
    select k.note_guid, min(k.deck_id) as lo, max(k.deck_id) as hi
      from public.anki_cards k
     group by k.note_guid
  ),
  exclusive as (
    select n.lo as id, count(*)::integer as notes
      from notes n
     where n.lo = n.hi
     group by n.lo
  ),
  split as (
    select distinct k.note_guid, k.deck_id
      from public.anki_cards k
      join notes n on n.note_guid = k.note_guid and n.lo <> n.hi
  ),
  -- A deck's subtree adds up its decks' cards and notes: a note in one deck is in one subtree's sum once; a split note
  -- is counted once per subtree apart. (Review of 3.2: the same figures as joining every card to every deck above it,
  -- which the function did before, in a fourth of the time with 80,000 cards.)
  subtree as (
    select t.root as id, coalesce(sum(c.cards), 0)::integer as cards, coalesce(sum(e.notes), 0)::integer as notes
      from tree t
      left join cards c on c.id = t.id
      left join exclusive e on e.id = t.id
     group by t.root
  ),
  subtree_split as (
    select t.root as id, count(distinct s.note_guid)::integer as notes
      from tree t
      join split s on s.deck_id = t.id
     group by t.root
  ),
  split_own as (
    select s.deck_id as id, count(*)::integer as notes
      from split s
     group by s.deck_id
  ),
  -- A split note is closed for a deck of it when every deck of the note is below that one.
  split_closed as (
    select z.deck_id as id, count(*)::integer as notes
      from (
        select o.deck_id, o.note_guid
          from split o
          join split x on x.note_guid = o.note_guid
          left join tree t on t.root = o.deck_id and t.id = x.deck_id
         group by o.deck_id, o.note_guid
        having count(*) = count(t.id)
      ) z
     group by z.deck_id
  )
  select d.id, d.name, d.parent, d.preset, d.semester, d.course_id, d.assessment_id,
         s.notes + coalesce(ss.notes, 0),
         s.cards,
         coalesce(e.notes, 0) + coalesce(o.notes, 0),
         coalesce(e.notes, 0),
         coalesce(e.notes, 0) + coalesce(c.notes, 0)
    from public.anki_decks d
    join subtree s on s.id = d.id
    left join subtree_split ss on ss.id = d.id
    left join exclusive e on e.id = d.id
    left join split_own o on o.id = d.id
    left join split_closed c on c.id = d.id
   order by d.name collate "C";
$$;

revoke all on function public.anki_deck_tree() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.anki_deck_tree() from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.anki_deck_tree() to service_role;
  end if;
end $$;

select public.rebuild_draft();
