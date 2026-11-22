// Which domain folder of the snapshot holds each function, table and sequence of the two databases.
import type { DomainOf, ObjectKind } from './render';

type Domain = Partial<Record<ObjectKind, string>>;

/** Space-separated names, to keep each domain readable; a new object must be placed here or the snapshot fails. */
const USERS: Record<string, Domain> = {
  access: {
    table: 'access_settings admin_emails invited_emails',
    function: `access_report access_status admin_access_report admin_invite_emails admin_remove_invites
      admin_set_admin caller_is_owner hook_before_user_created invite_emails is_admin is_allowed_email
      is_allowed_user is_invited normalize_invite_email remove_invites require_admin_session token_session_open`,
  },
  account: {
    table: 'account_deletions legal_acceptances profiles',
    function: `accept_legal create_profile export_my_data purge_deleted_accounts request_account_deletion
      resume_account sync_profile`,
  },
  study: {
    table: `assessment_settings card_states card_sync deck_activations deck_settings review_log review_undo
      study_days study_preferences user_presets user_quotas`,
    function: `answered_decks browse_change_card bury_cards card_rows_from_a_page_behind card_states_of_decks
      change_card deck_progress first_answers_since forget_cards home_counts lock_card_state lock_user_study
      log_change median_answer_ms quota_cards quota_changes quota_rows reconcile_cards record_practice
      record_review review_log_set_day set_flag set_flags study_day_of study_day_of_start study_days_count
      study_heatmap suspend_cards unbury_cards undo_last_review unsuspend_cards`,
  },
  quizzes: {
    table: 'quiz_answers quiz_progress quiz_rounds readings',
    function: 'quota_quiz_bytes readings_progress_never_decreases save_quiz_progress',
  },
  reports: {
    table: 'content_reports report_blocks report_resolutions',
    function: `admin_reopen_reports admin_report_queue admin_resolve_reports admin_set_report_block
      anonymize_old_reports check_new_report my_reports report_content report_limits`,
  },
  admin: {
    function:
      'admin_deck_impact admin_usage health site_day site_day_start usage_figure usage_students',
  },
};

const CONTENT: Record<string, Domain> = {
  catalog: {
    table: 'assessments content_meta courses semesters site_settings',
    function: 'import_state save_catalog set_site_settings site_settings sync_catalog',
  },
  notes: {
    table: 'note_sections notes',
    function:
      'prune_content prune_notes query_to_tsquery save_note save_notes search_notes search_notes_except',
  },
  quizzes: {
    table: 'quiz_questions quizzes',
    function: 'prune_quizzes quiz_detail quiz_section save_quiz save_quizzes',
  },
  anki: {
    table: `anki_browse_indexes anki_card_changes anki_cards anki_decks anki_note_types anki_notes
      anki_presets`,
    sequence: 'anki_card_change_seq',
    function: `anki_browse_indexes anki_card anki_card_changed anki_card_changes_since anki_deck anki_deck_detail
      anki_deck_summaries anki_deck_tree anki_plain_text prune_anki save_anki_browse_indexes save_anki_catalog
      save_anki_note save_anki_notes`,
  },
  draft: {
    table: 'draft_exclusions',
    function: `discard_draft_assessment discard_draft_assessment_content draft_drift draft_mirror draft_pattern
      draft_pending_changes rebuild_draft reset_draft`,
  },
  release: {
    table: 'release_changes release_marks release_versions releases',
    function: `publish_release release_article_changes release_browse_index_changes release_card_changes
      release_cloze_signature release_digest_columns release_digest_shift release_digests
      release_digests_fingerprint release_fingerprint release_items release_json_text release_log release_media
      release_neutral_fields release_note_changes release_question_changes release_question_class
      release_rows_digest release_schema_fingerprint release_shape release_summary release_tables release_text
      release_texts revert_release set_release_mark`,
  },
  unpublish: {
    table: 'unpublish_log unpublished_note_versions',
    function: `restore_note_version unpublish_content unpublish_draft unpublish_draft_browse_indexes
      unpublish_log_drops_browse_indexes unpublish_log_entries unpublish_log_to_draft`,
  },
};

function lookup(domains: Record<string, Domain>): Map<string, string> {
  const places = new Map<string, string>();
  for (const [domain, byKind] of Object.entries(domains)) {
    for (const [kind, names] of Object.entries(byKind)) {
      for (const name of names.split(/\s+/).filter(Boolean)) {
        const key = `${kind} ${name}`;
        if (places.has(key)) throw new Error(`${key} is in two domains`);
        places.set(key, domain);
      }
    }
  }
  return places;
}

export function domainsOf(database: 'users' | 'content'): DomainOf {
  const places = lookup(database === 'users' ? USERS : CONTENT);
  return (kind, name) => {
    const domain = places.get(`${kind} ${name}`);
    if (!domain) {
      throw new Error(
        `The ${kind} ${name} of ${database} has no domain: add it to db/scripts/schema/domains.ts`,
      );
    }
    return domain;
  };
}
