// Checks `content/credits.json`, the people named on /about.
export const CREDITS_FILE = 'credits.json';

/** The groups of the thanks on /about. Teachers are not one of them, on purpose. */
const CREDIT_GROUPS = ['material', 'pad', 'reports', 'other'] as const;
type CreditGroup = (typeof CREDIT_GROUPS)[number];

interface CreditedPerson {
  name: string;
  group: CreditGroup;
  permission: {
    date: string;
    how: string;
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A name appears only with that person's written permission, so each one needs its date and how it was given. */
export function checkCredits(data: unknown, today: string): string[] {
  const problems: string[] = [];
  const people = (data as { people?: unknown } | null)?.people;
  if (!Array.isArray(people)) return ['falta la lista «people»'];
  const seen = new Set<string>();
  people.forEach((raw, i) => {
    const p = (raw ?? {}) as Partial<CreditedPerson>;
    const who = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `fila ${i + 1}`;
    if (typeof p.name !== 'string' || !p.name.trim()) problems.push(`${who}: sin nombre`);
    else if (seen.has(p.name.trim().toLowerCase())) problems.push(`${who}: repetido`);
    else seen.add(p.name.trim().toLowerCase());
    if (!CREDIT_GROUPS.includes(p.group as CreditGroup)) {
      problems.push(`${who}: grupo «${String(p.group)}» (${CREDIT_GROUPS.join(', ')})`);
    }
    const date = p.permission?.date;
    if (
      typeof date !== 'string' ||
      !ISO_DAY.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    ) {
      problems.push(`${who}: sin la fecha del permiso (AAAA-MM-DD)`);
    } else if (date > today) {
      problems.push(`${who}: el permiso tiene fecha futura (${date})`);
    }
    if (typeof p.permission?.how !== 'string' || !p.permission.how.trim()) {
      problems.push(`${who}: sin decir cómo dio el permiso`);
    }
  });
  return problems;
}
