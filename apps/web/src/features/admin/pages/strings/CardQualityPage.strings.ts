// The texts of CardQualityPage.

export const cardQualityPageStrings = {
  title: 'Tarjetas',
  intro: (min: number) =>
    `Cómo les va a todos los estudiantes con cada tarjeta, sin decir quiénes. Una tarjeta muestra sus cifras desde que la vieron ${String(min)} estudiantes, y cada porcentaje va con su intervalo de confianza del 95 %. Las cifras se calculan cada noche.`,
  explain: {
    hardest:
      'Ordenadas por cuánto las fallan en los repasos (el extremo bajo del intervalo): arriba, las que seguro cuestan.',
    suspicious:
      'Fallan más de lo que esperaba FSRS, se responden en menos de 2 segundos, muchos las suspenden o muchos las olvidan una y otra vez (sanguijuelas).',
  },
  export: 'Exportar la lista (CSV)',
  unavailable:
    'Las cifras de las tarjetas todavía no están disponibles en este sitio. Aparecerán cuando la base de datos tenga su resumen.',
  noCourse: 'Todavía no hay ramos con tarjetas.',
} as const;
