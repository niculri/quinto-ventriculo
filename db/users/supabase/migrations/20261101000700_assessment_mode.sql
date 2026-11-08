-- v1.7: the assessment mode (docs/v1/BRIEF-1.7.md). The scheduler does not change: with the date of the test, the web
-- computes how many new cards a day to give. Same rules as the study tables: RLS on the table (already on),
-- default privileges revoked, functions with search_path = ''.

-- The date of the test, as each student has it (a calendar day, without a time or a zone); how many of the days before
-- it are only for reviewing (no new cards); and when the date was put (the pace can only «rise» from the day after).
alter table public.assessment_settings
  add column exam_date date check (exam_date between '2000-01-01' and '2100-12-31'),
  add column final_review_days smallint not null default 3 check (final_review_days in (1, 3, 7)),
  add column exam_date_set_at timestamptz;

-- What the assessment mode needs to know about each deck of the user, in one small read, whatever page they are on
-- (a lecture's page does not load the assessment's cards):
-- - seen: cards answered at least once and not forgotten (the rest of the deck's cards are new);
-- - new_suspended: new cards under «No mostrar más», which will never come out;
-- - overdue: cards whose day to be reviewed passed before today, and that could have come out (a due date stands for
--   the day whose start is the nearest: its start is before `day_start` by at least half a day). A card buried until
--   today or later could not: answering a sibling buries it for the rest of that day, and that is nobody's delay;
-- - new_today and new_yesterday: new cards answered today and on the day before.
-- `day_start` is the start of the user's day (the web knows their zone and rollover hour).
-- The caller's rights and RLS: only their own rows.
create function public.deck_progress(day_start timestamptz)
returns table (
  deck_id text,
  seen integer,
  new_suspended integer,
  overdue integer,
  new_today integer,
  new_yesterday integer
)
language sql
stable
set search_path = ''
as $$
  with states as (
    select s.deck_id,
           count(*) filter (where s.phase <> 'new') as seen,
           count(*) filter (where s.phase = 'new' and s.suspended) as new_suspended,
           count(*) filter (
             where s.phase <> 'new' and s.interday and not s.suspended
               and (s.buried_until is null or s.buried_until < day_start - interval '12 hours')
               and s.due < day_start - interval '12 hours'
           ) as overdue
      from public.card_states s
     where s.user_id = auth.uid()
     group by s.deck_id
  ), introduced as (
    select l.deck_id,
           count(*) filter (where l.reviewed_at >= day_start) as new_today,
           count(*) filter (where l.reviewed_at < day_start) as new_yesterday
      from public.review_log l
     where l.user_id = auth.uid()
       and l.rating is not null
       and l.queue_before = 'new'
       and l.reviewed_at >= day_start - interval '1 day'
     group by l.deck_id
  )
  select coalesce(s.deck_id, i.deck_id),
         coalesce(s.seen, 0)::integer,
         coalesce(s.new_suspended, 0)::integer,
         coalesce(s.overdue, 0)::integer,
         coalesce(i.new_today, 0)::integer,
         coalesce(i.new_yesterday, 0)::integer
    from states s
    full join introduced i on i.deck_id = s.deck_id;
$$;

revoke execute on function public.deck_progress(timestamptz) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.deck_progress(timestamptz) from anon, authenticated;
    grant execute on function public.deck_progress(timestamptz) to authenticated;
  end if;
end $$;
