// The texts of the landing page (at startup): the sign-in, the top, what is inside and what is coming.
export const landingStrings = {
  enter: ' Entrar',
  opening: 'Abriendo Google…',
  signIn: 'Entrar con Google',
  failed: 'No se pudo entrar',
  googleFailed: 'No se pudo abrir Google. Revisa tu conexión e intenta de nuevo.',
  kicker: 'Medicina · Universidad de Chile',
  title: 'El Quinto Ventrículo',
  motto: 'El ventrículo que no aparece en el Netter.',
  lead: 'Apuntes de las clases ordenados por semestre, ramo y certamen, con un buscador que encuentra cualquier concepto en segundos, tarjetas para estudiar con repetición espaciada y tests de práctica.',
  invited: 'Por ahora entran solo personas invitadas.',
  onlyDomain: ' Solo con tu cuenta @ug.uchile.cl',
  inside: {
    title: 'Qué hay adentro',
    lead: 'Lo que ya puedes usar con tu cuenta.',
    notes: {
      title: 'Apuntes tipo wiki, con buscador',
      text: 'Cada clase y seminario como una página, con figuras, lo que enfatizó el profe y los errores de las diapositivas corregidos. Escribe «nucléolo» o «GPCR» y llegas directo a la sección, sin importar acentos ni mayúsculas.',
    },
    cards: {
      title: 'Tarjetas de estudio con FSRS',
      text: 'Tarjetas con la repetición espaciada de Anki (FSRS), un buscador de tarjetas como el suyo y tus propias opciones de estudio. Tu avance queda guardado.',
    },
    tests: {
      title: 'Tests de práctica',
      text: 'Preguntas de alternativas de certámenes de años anteriores y preguntas nuevas, con el veredicto al instante, la explicación de cada alternativa y la opción de repetir solo las que fallaste.',
    },
    career: {
      title: 'Ordenado como la carrera',
      text: 'Por semestre, ramo y certamen (y por semana, donde el ramo va así), desde el computador o el teléfono. El material se va sumando ramo por ramo.',
    },
  },
  coming: {
    title: 'Lo que viene',
    lead: 'En preparación. Cuando esté listo, aparecerá en tu misma cuenta, sin hacer nada más.',
    gymkana: {
      title: 'Gymkana de anatomía',
      text: 'Fotos de preparados con alfileres, en modo repaso y en modo certamen.',
    },
    stats: {
      title: 'Estadísticas de estudio',
      text: 'Cuánto estudias, qué retienes y cuántas tarjetas se vienen, día a día.',
    },
    summaries: {
      title: 'Resúmenes de certamen',
      text: 'Todo lo que entra en un certamen en una sola lectura corrida, para el repaso final.',
    },
  },
  soon: 'Pronto',
  available: 'Disponible',
  howTo: 'Cómo se usa',
  faq: 'Preguntas frecuentes',
} as const;
