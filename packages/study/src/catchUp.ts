// The plan to catch up with overdue cards, and the sentence that says it.

export const LARGE_BACKLOG = 50;
const CATCH_UP_DAYS = 5;
const CATCH_UP_MAX_A_DAY = 100;

export interface CatchUp {
  overdue: number;
  perDay: number;
  days: number;
}

// Only information: the scheduler keeps giving every card that is due.
export function catchUpPlan(overdue: number, daysLeft: number | null): CatchUp | null {
  // On the day of the test there is no plan to give: it would end after it.
  if (overdue < LARGE_BACKLOG || daysLeft === 0) return null;
  let days = CATCH_UP_DAYS;
  if (overdue / days > CATCH_UP_MAX_A_DAY) days = Math.ceil(overdue / CATCH_UP_MAX_A_DAY);
  if (daysLeft !== null) days = Math.min(days, daysLeft);
  const perDay = Math.ceil(overdue / days / 5) * 5;
  return { overdue, perDay, days };
}

export function catchUpText(plan: CatchUp): string {
  const n = (x: number) => x.toLocaleString('es-CL');
  return `Llevas ${n(plan.overdue)} atrasadas. Con ~${n(plan.perDay)} al día, además de lo de hoy, te pones al día en ${plan.days === 1 ? '1 día' : `${plan.days} días`}.`;
}
