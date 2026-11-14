// Constants shared with the databases and the legal pages: `@qv/schema/constants`.
export { ALLOWED_DOMAIN, CONTACT_EMAIL, isAllowedEmail } from './domain';
export { CALLOUT_LABELS, calloutLabel } from './callouts';
export {
  ACCOUNT_DELETION_DAYS,
  DATA_CONTROLLER,
  INACTIVE_ACCOUNT_MONTHS,
  LEGAL_VERSIONS,
} from './legal';
export {
  CATEGORIES_OF,
  QUOTE_CONTEXT,
  QUOTE_MAX,
  REPORT_COMMENT_MAX,
  REPORT_LIMITS,
  RESOLUTION_NOTE_MAX,
  RESOLUTION_STATUSES,
} from './reports';
export type { ReportCategory, ReportKind, ResolutionStatus } from './reports';
