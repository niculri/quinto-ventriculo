// The texts of the «Reportar error» popup, which loads with every page where something can be reported.
import type { ReportKind } from '@qv/schema';

export const dialogStrings = {
  title: 'Reportar error',
  intro: {
    card: 'Cuéntanos qué está mal en esta tarjeta. Le llega al autor para corregirla.',
    note: 'Cuéntanos qué está mal en este apunte. Le llega al autor para corregirlo.',
    quiz_question: 'Cuéntanos qué está mal en esta pregunta. Le llega al autor para corregirla.',
  } satisfies Record<ReportKind, string>,
  selected: 'Texto seleccionado',
  image: 'Imagen: ',
  category: 'Qué tipo de error',
  comment: '¿Qué está mal?',
  private: 'Lo lee solo quien corrige el sitio. No escribas datos personales.',
  failed: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.',
  cancel: 'Cancelar',
  sending: 'Enviando…',
  send: 'Enviar',
} as const;
