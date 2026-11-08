-- Plan step 1.7, part 2 (B4 of docs/plan/areas/publicacion-y-anuncios.md): whom a release reaches, for the panel
-- /settings/admin/releases. Additive: one function, only for an administrator.
--
-- Counts by deck, never a walk of card_states: for each student and each deck asked, one lookup in the index
-- card_states_deck (user_id, deck_id) and one in the key of deck_activations. With 5,000 students and 300 decks that is
-- at most 1.5 million index lookups, and only the rows of those decks are read; the per-card detail is not computed.

-- For each deck: how many students have seen at least one of its cards (a card answered at least once, taken out or
-- not), how many of its cards they have seen in all, and how many turned it on by hand (a week or a lecture).
create function public.admin_deck_impact(deck_ids text[])
returns table (deck_id text, students_seen integer, cards_seen integer, students_active integer)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo para administradores.' using errcode = '42501';
  end if;
  if deck_ids is null or cardinality(deck_ids) > 300 then
    raise exception 'admin_deck_impact: at most 300 decks' using errcode = '22023';
  end if;
  return query
    select d.id, coalesce(x.seen, 0)::integer, coalesce(x.cards, 0)::integer, coalesce(x.active, 0)::integer
      from (select distinct v as id from unnest(deck_ids) as v where v ~ '^[0-9]{1,20}$') d
      left join lateral (
        select count(*) filter (where s.cards > 0) as seen, sum(s.cards) as cards,
               count(*) filter (where a.active) as active
          from auth.users u
          cross join lateral (
            select count(*) as cards from public.card_states c
             where c.user_id = u.id and c.deck_id = d.id and c.phase <> 'new'
          ) s
          left join public.deck_activations a on a.user_id = u.id and a.deck_id = d.id
      ) x on true
     order by d.id;
end;
$$;
revoke execute on function public.admin_deck_impact(text[]) from public, anon;
grant execute on function public.admin_deck_impact(text[]) to authenticated;
