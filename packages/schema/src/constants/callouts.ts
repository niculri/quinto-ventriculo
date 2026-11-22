// The labels of the note callouts (`> [!type] …`); the web colors each with its `callout-<type>` class.
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
  return Object.hasOwn(CALLOUT_LABELS, type)
    ? CALLOUT_LABELS[type]!
    : type.charAt(0).toUpperCase() + type.slice(1);
}
