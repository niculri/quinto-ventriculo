-- Plan step 2.6, second part: card_reports goes. Applied in production on 2026-11-08, once the web of step 2.6 was
-- deployed (the web of before wrote card_reports, and mirror_card_report() copied its rows to content_reports until
-- then); until that day it waited outside migrations/, so that nobody applied it together with the first one. How it
-- was checked first that every row was in content_reports: docs/configuracion.md → «Publicar el paso 2.6».
-- db/tests/reports.test.ts applies it on top of the first one, with rows of card_reports.
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

-- 1. The download without card_reports (the same as …_content_reports.sql otherwise) -------------------------------

create or replace function public.export_my_data()
returns json
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null or not public.token_session_open() then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_user;
  return json_build_object(
    'site', 'El Quinto Ventrículo',
    'format', 1,
    'exported_at', now(),
    'user_id', v_user,
    'account', (select json_build_object(
                  'email', u.email,
                  'created_at', u.created_at,
                  'last_sign_in_at', u.last_sign_in_at,
                  'google', u.raw_user_meta_data)
                  from auth.users u where u.id = v_user),
    'identities', coalesce((select json_agg(json_build_object(
                    'provider', i.provider,
                    'email', i.email,
                    'data', i.identity_data,
                    'created_at', i.created_at,
                    'last_sign_in_at', i.last_sign_in_at) order by i.created_at)
                    from auth.identities i where i.user_id = v_user), '[]'::json),
    'sessions', coalesce((select json_agg(json_build_object(
                  'created_at', s.created_at,
                  'updated_at', s.updated_at,
                  'refreshed_at', s.refreshed_at,
                  'not_after', s.not_after,
                  'user_agent', s.user_agent,
                  'ip', s.ip) order by s.created_at)
                  from auth.sessions s where s.user_id = v_user), '[]'::json),
    'tables', json_build_object(
      'profiles', coalesce((select json_agg(t) from public.profiles t where t.id = v_user), '[]'::json),
      'invited_emails', coalesce((select json_agg(t) from public.invited_emails t where t.email = v_email), '[]'::json),
      'admin_emails', coalesce((select json_agg(t) from public.admin_emails t where t.email = v_email), '[]'::json),
      'legal_acceptances', coalesce((select json_agg(t order by t.accepted_at)
        from public.legal_acceptances t where t.user_id = v_user), '[]'::json),
      'account_deletions', coalesce((select json_agg(t) from public.account_deletions t where t.user_id = v_user), '[]'::json),
      'study_preferences', coalesce((select json_agg(t) from public.study_preferences t where t.user_id = v_user), '[]'::json),
      'user_presets', coalesce((select json_agg(t order by t.created_at)
        from public.user_presets t where t.user_id = v_user), '[]'::json),
      'deck_settings', coalesce((select json_agg(t order by t.deck_id)
        from public.deck_settings t where t.user_id = v_user), '[]'::json),
      'deck_activations', coalesce((select json_agg(t order by t.deck_id)
        from public.deck_activations t where t.user_id = v_user), '[]'::json),
      'assessment_settings', coalesce((select json_agg(t order by t.deck_id)
        from public.assessment_settings t where t.user_id = v_user), '[]'::json),
      'card_states', coalesce((select json_agg(t order by t.note_guid, t.ord)
        from public.card_states t where t.user_id = v_user), '[]'::json),
      'card_sync', coalesce((select json_agg(t) from public.card_sync t where t.user_id = v_user), '[]'::json),
      'review_log', coalesce((select json_agg(t order by t.id)
        from public.review_log t where t.user_id = v_user), '[]'::json),
      'review_undo', coalesce((select json_agg(t order by t.log_id)
        from public.review_undo t where t.user_id = v_user), '[]'::json),
      'study_days', coalesce((select json_agg(t order by t.day, t.deck_id)
        from public.study_days t where t.user_id = v_user), '[]'::json),
      'quiz_rounds', coalesce((select json_agg(t order by t.started_at)
        from public.quiz_rounds t where t.user_id = v_user), '[]'::json),
      'quiz_answers', coalesce((select json_agg(t order by t.answered_at, t.position)
        from public.quiz_answers t where t.user_id = v_user), '[]'::json),
      'quiz_progress', coalesce((select json_agg(t order by t.quiz_id, t.section_id)
        from public.quiz_progress t where t.user_id = v_user), '[]'::json),
      'readings', coalesce((select json_agg(t order by t.note_id)
        from public.readings t where t.user_id = v_user), '[]'::json),
      'content_reports', coalesce((select json_agg(json_build_object(
          'id', t.id, 'target_kind', t.target_kind, 'target_id', t.target_id, 'target_code', t.target_code,
          'target_version', t.target_version, 'location', t.location, 'category', t.category, 'comment', t.comment,
          'created_at', t.created_at,
          'resolution', (select json_build_object('status', x.status, 'note', x.public_note,
                                                  'fixed_version', x.fixed_version, 'resolved_at', x.resolved_at)
                           from public.report_resolutions x where x.id = t.resolution_id))
          order by t.created_at)
        from public.content_reports t where t.user_id = v_user), '[]'::json),
      'report_blocks', coalesce((select json_agg(t) from public.report_blocks t where t.user_id = v_user), '[]'::json),
      'user_quotas', coalesce((select json_agg(t) from public.user_quotas t where t.user_id = v_user), '[]'::json)));
end;
$$;

-- 2. card_reports and what only served it ----------------------------------------------------------------------------

drop trigger mirror_card_report on public.card_reports;
drop function public.mirror_card_report();
drop function public.admin_card_reports();
drop trigger quota_reports on public.card_reports;
drop function public.quota_reports();
drop table public.card_reports;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
