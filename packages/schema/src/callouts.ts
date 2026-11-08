/**
 * Note callouts (`> [!type] …`). They are the same as in clase-a-apunte; the web stylesheet colors them
 * with the `callout-<type>` class. `note` is the plain callout, without a type and without a label.
 */
export const CALLOUT_LABELS: Readonly<Record<string, string>> = {
  note: '',
  datos: 'Datos clave',
  question: 'Pregunta de la guía',
  profe: 'Lo que enfatizó el profe',
  clinica: 'Relevancia clínica',
  ojo: 'Ojo',
  clave: 'Puntos clave',
  libro: 'Extras del libro',
  video: 'Extras del video',
  preparado: 'En preparado',
  termino: 'Término',
  error: 'Error',
};

export function calloutLabel(type: string): string {
  return CALLOUT_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}
