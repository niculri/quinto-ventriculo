// The texts of SearchResults.

export const searchResultsStrings = {
  howTo:
    'Busca por concepto, estructura o proceso. No importan los acentos ni las mayúsculas, y basta con el comienzo de la palabra: «transcrip» encuentra «transcripción».',
  failed: 'No se pudo buscar',
  nothingFor: 'Nada para «',
  nothingAfter:
    '». Prueba con el comienzo de la palabra, con otro nombre de la estructura o sin abreviaturas.',
  career: 'Ver toda la carrera',
  sections: (n: number) => (n === 1 ? 'sección' : 'secciones'),
  in: ' en ',
  notes: (n: number) => (n === 1 ? 'apunte' : 'apuntes'),
} as const;
