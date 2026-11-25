// What the assessment mode says in words about a pace: the status line, the summary and the longest of each.
import { catchUpText } from './catchUp';
import { daysLeftText } from './examDate';
import type { AssessmentFacts, Pace, PaceOption } from './paceTypes';
import { minutesText } from './simple';

export function onTrackText(pace: Pace, facts: AssessmentFacts, rose: boolean): string {
  if (pace.kind === 'nothing-on') return 'nada activado';
  if (pace.kind === 'final-review' && facts.newLeft > 0) return 'repaso final';
  if (rose) return `ahora ${pace.newPerDay.toLocaleString('es-CL')} nuevas al día`;
  return 'vas al día';
}

const OFF_WORDS = {
  video: ['video', 'videos'],
  week: ['semana', 'semanas'],
  lecture: ['clase', 'clases'],
} as const;

const unitsOffText = (facts: AssessmentFacts) => {
  const n = facts.unitsOff;
  const [one, many] = OFF_WORDS[facts.offKind];
  const word = n === 1 ? one : many;
  return `${n} ${word} sin activar no ${n === 1 ? 'cuenta' : 'cuentan'}`;
};

function finalReviewStatus(
  pace: Pace,
  facts: AssessmentFacts,
  options: PaceOption[],
  finalDays: number,
  left: string,
): string {
  const fewer = options.some(
    (o) => o.finalDays < finalDays && o.newPerDay! > 0 && facts.newLeft > 0,
  );
  return `${daysLeftText(pace.daysLeft!)}: ${pace.daysLeft === 0 ? 'no salen tarjetas nuevas' : 'son días de repaso final, sin tarjetas nuevas'}.${
    facts.newLeft > 0
      ? ` Quedan ${left} sin ver${fewer ? ': si dejas menos días para repasar, siguen saliendo' : ''}.`
      : ''
  }`;
}

function computedStatus(
  pace: Pace,
  facts: AssessmentFacts,
  chosen: PaceOption,
  left: string,
  off: string,
  rose: boolean,
  unrealistic: boolean,
): string {
  return [
    `${daysLeftText(pace.daysLeft!)} · ${facts.newLeft > 0 ? `quedan ${left} en lo activado` : 'ya viste todo lo activado'}${off}.`,
    // A pace that is too much says more than one that rose (the number is in sight).
    rose && !unrealistic ? `Para llegar a la fecha, ahora son ${pace.newPerDay} al día.` : '',
    unrealistic
      ? `Son ${minutesText(chosen.minutes!)} al día: con menos tiempo no alcanzas a ver todo. Puedes apagar clases o extras, o elegir otra fecha.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function paceStatus(
  pace: Pace,
  facts: AssessmentFacts,
  options: PaceOption[],
  finalDays: number,
  rose: boolean,
  unrealistic: boolean,
): string {
  const off = facts.unitsOff > 0 ? ` · ${unitsOffText(facts)}` : '';
  const left = `${facts.newLeft.toLocaleString('es-CL')} ${facts.newLeft === 1 ? 'nueva' : 'nuevas'}`;
  switch (pace.kind) {
    case 'none':
      return '';
    case 'past':
      return 'Esa fecha ya pasó: salen las nuevas por día que elijas. Pon la fecha de la próxima prueba o saca esta.';
    case 'nothing-on':
      return `${daysLeftText(pace.daysLeft!)}. Activa un video, una semana o una clase para calcular las nuevas por día.`;
    case 'final-review':
      return finalReviewStatus(pace, facts, options, finalDays, left);
    case 'finished':
      return `${daysLeftText(pace.daysLeft!)} · ya viste todo lo activado${off}.`;
    case 'computed': {
      const chosen = options.find((o) => o.finalDays === finalDays)!;
      return computedStatus(pace, facts, chosen, left, off, rose, unrealistic);
    }
  }
}

export const LONGEST_STATUS =
  'Faltan 120 días · quedan 12.400 nuevas en lo activado · 12 semanas sin activar no cuentan. Son ~3 h 30 min al día: con menos tiempo no alcanzas a ver todo. Puedes apagar clases o extras, o elegir otra fecha.';

export const LONGEST_CATCH_UP = catchUpText({ overdue: 1240, perDay: 100, days: 13 });
