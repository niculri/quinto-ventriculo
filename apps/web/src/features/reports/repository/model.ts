// The error reports domain (targets, reports, resolutions and the queue), its error and the messages it shows.
import { CONTACT_EMAIL, REPORT_LIMITS } from '@qv/schema';
import type { ReportCategory, ReportKind, ResolutionStatus } from '@qv/schema';

export interface ReportLocation {
  path?: string;
  title?: string;
  deckId?: string;
  section?: string;
  sectionTitle?: string;
  quote?: { exact: string; prefix?: string; suffix?: string };
  figure?: string;
  quizId?: string;
  sectionId?: string;
  number?: number;
}

export interface ReportTarget {
  kind: ReportKind;
  /** 'guid:ord' (card) · the article's id (note) · 'quiz/question' (quiz_question). */
  id: string;
  code: string | null;
  version: number | null;
  location: ReportLocation;
}

export interface NewReport extends ReportTarget {
  category: ReportCategory;
  comment: string;
}

export interface Resolution {
  status: ResolutionStatus;
  note: string | null;
  fixedVersion: number | null;
  resolvedAt: string;
}

export interface MyReport {
  id: string;
  kind: ReportKind;
  targetId: string;
  code: string | null;
  version: number | null;
  category: ReportCategory;
  comment: string;
  location: ReportLocation;
  createdAt: string;
  resolution: Resolution | null;
}

export interface Reporter {
  id: string;
  name: string | null;
  email: string | null;
  blocked: boolean;
}

export interface QueueReport {
  id: string;
  category: ReportCategory;
  comment: string;
  location: ReportLocation;
  version: number | null;
  createdAt: string;
  /** Null: the account was deleted, or the report was closed more than 12 months ago. */
  reporter: Reporter | null;
}

export interface ReportGroup {
  kind: ReportKind;
  targetId: string;
  code: string | null;
  version: number | null;
  title: string | null;
  path: string | null;
  reporters: number;
  firstAt: string;
  lastAt: string;
  resolution: (Resolution & { id: string }) | null;
  reports: QueueReport[];
}

interface BlockedReporter {
  id: string;
  name: string | null;
  email: string | null;
  blockedAt: string;
}

export interface ReportQueue {
  open: ReportGroup[];
  resolved: ReportGroup[];
  blocked: BlockedReporter[];
}

export interface ResolveInput {
  kind: ReportKind;
  targetId: string;
  status: ResolutionStatus;
  note: string | null;
  fixedVersion: number | null;
}

export class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

export const REPORT_MESSAGES = {
  dailyLimit: `Ya enviaste ${REPORT_LIMITS.perDay} reportes hoy, el máximo por día. Podrás enviar más mañana.`,
  placeLimit: `Ya tienes ${REPORT_LIMITS.openPerPlace} reportes sin revisar en este mismo lugar, el máximo. Si es otro error, repórtalo desde su propia tarjeta, pregunta o frase del apunte.`,
  // A blocked person gets the plain refusal, with the contact, and is not told they are blocked.
  blocked: `No se pudo enviar el reporte. Si vuelve a pasar, escribe a ${CONTACT_EMAIL}.`,
  sessionClosed: 'Tu sesión se cerró. Sal y vuelve a entrar.',
  adminOnly: 'Solo para administradores.',
  nothingOpen: 'Ya no quedan reportes abiertos de esto. Recarga la página.',
  adminStays: 'A un administrador no se le bloquea.',
  offline: 'No se pudo. Revisa tu conexión e inténtalo de nuevo.',
} as const;
