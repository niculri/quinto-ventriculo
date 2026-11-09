/**
 * The people named on /about (step 2.7, EXP-P3). A name appears only with that person's written permission, kept
 * with its date in the private repository's `content/credits.json`; nobody is named otherwise (the thanks go by
 * group), and there is no list of teachers. This checks the file: every person has a name, a group and the date and
 * the way of their permission.
 *
 *   { "people": [{ "name": "…", "group": "material", "permission": { "date": "2026-11-20", "how": "…" } }] }
 */

export const CREDITS_FILE = 'credits.json';

/** The groups of the thanks on /about. Teachers are not one of them, on purpose. */
export const CREDIT_GROUPS = ['material', 'pad', 'reports', 'other'] as const;
export type CreditGroup = (typeof CREDIT_GROUPS)[number];

export interface CreditedPerson {
  name: string;
  group: CreditGroup;
  permission: {
    /** When they said yes («2026-11-20»). */
    date: string;
    /** How: the message or the email where they said it. */
    how: string;
  };
}

export interface Credits {
  people: CreditedPerson[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What is wrong with `content/credits.json` (empty: nothing). `today` is «YYYY-MM-DD». */
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
