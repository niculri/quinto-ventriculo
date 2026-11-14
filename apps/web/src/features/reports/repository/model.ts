// The error reports domain (targets, reports, resolutions and the queue), its error and the messages it shows.
import { CONTACT_EMAIL, REPORT_LIMITS } from '@qv/schema';
export type {
  MyReport,
  NewReport,
  QueueReport,
  Reporter,
  ReportGroup,
  ReportLocation,
  ReportQueue,
  ReportTarget,
  Resolution,
  ResolveInput,
} from '@qv/schema/user';

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
