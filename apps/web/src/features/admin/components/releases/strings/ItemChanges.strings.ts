// The texts of ItemChanges.

import type { ReleaseClass, ReleaseOp } from '@qv/schema';

export const itemChangesStrings = {
  classes: {
    answer: 'Puede cambiar la respuesta',
    no_answer: 'No cambia la respuesta',
    format: 'Solo formato',
    content: 'Cambia el texto',
  } satisfies Record<ReleaseClass, string>,
  ops: {
    added: 'Nueva',
    removed: 'Sale',
    changed: 'Cambia',
    moved: 'Cambia de lugar',
  } satisfies Record<ReleaseOp, string>,
  items: {
    sameFieldsOtherLook:
      'Los campos se leen igual, pero cambia lo que muestra la tarjeta: su plantilla o una imagen.',
    sameText: 'El texto se lee igual.',
    card: (n: number) => `Tarjeta ${n}: `,
    cardMoved: (before: string, after: string) => `de «${before}» a «${after}»`,
    cardAdded: (deck: string) => `nueva, en «${deck}»`,
    cardRemoved: (deck: string) => `sale de «${deck}»`,
    version: (before: number, after: number) => ` · .${before} → .${after}`,
    title2: (first: string, second: string) => `${first} · ${second}`,
    title: 'Título',
    section: (title: string, op: 'added' | 'removed' | 'changed') =>
      `${title}${op === 'added' ? ' (nueva)' : op === 'removed' ? ' (sale)' : ''}`,
    keyChanged: 'Cambia la clave',
    correctWas: (before: string, after: string) =>
      `La correcta era la ${before} y ahora es la ${after}`,
    movedFrom: (before: string, after: string) => `Pasa de «${before}» a «${after}».`,
    where: (section: string | null, group: string | null) => `${section ?? ''} · ${group ?? ''}`,
    fields: {
      context: 'Contexto',
      prompt: 'Pregunta',
      answer: 'Respuesta',
      explanation: 'Explicación',
      origin: 'Origen',
    },
    option: (letter: string) => `Alternativa ${letter}`,
    figure: 'Cambia una figura.',
  },
} as const;
