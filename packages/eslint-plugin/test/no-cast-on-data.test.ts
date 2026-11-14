// The rule against casting a database answer: every way of writing `data as T`, and the casts that are not on data.
import { noCastOnData } from '../src/no-cast-on-data.js';
import { code } from './rule-tester';

const cast = [{ messageId: 'cast' }];

code.run('qv/no-cast-on-data', noCastOnData, {
  valid: [
    'const a = value as string;',
    'const a = x.rows as string[];',
    "const a = x['rows'] as string[];",
    'const { data: rows } = r; const a = rows.length as number;',
    'const { rows } = r; const a = rows as string[];',
    'const a = fromDatabase(fn, schema, data);',
    'const a = { ok: true as const };',
    'function f(data2: unknown) { return data2 as string; }',
    'const rows = other; const a = rows as string[];',
    'const a = data satisfies Json;',
    'const a = (data && data.length) as number;',
    'const a = (rows ?? []) as string[];',
  ],
  invalid: [
    { code: 'const a = data as string;', errors: cast },
    { code: 'const a = r.data as string;', errors: cast },
    { code: 'const a = r?.data as string;', errors: cast },
    { code: "const a = r['data'] as string;", errors: cast },
    { code: "const a = r?.['data'] as string;", errors: cast },
    { code: 'const a = r.data! as string;', errors: cast },
    { code: 'const a = r?.data! as string;', errors: cast },
    { code: 'const a = data as unknown as string;', errors: cast },
    { code: 'const a = <string>data;', errors: cast },
    { code: 'const a = <string>r.data;', errors: cast },
    { code: 'const { data: rows } = r; const a = rows as string[];', errors: cast },
    { code: 'const { data: rows = [] } = r; const a = rows as string[];', errors: cast },
    { code: "const { ['data']: rows } = r; const a = rows as string[];", errors: cast },
    { code: 'const rows = r.data; const a = rows as string[];', errors: cast },
    { code: 'const rows = data; const a = rows as string[];', errors: cast },
    {
      code: 'async function f() { const { data: rows } = await q(); return rows as string[]; }',
      errors: cast,
    },
    { code: 'const a = (data ?? []) as string[];', errors: cast },
    { code: 'const a = (r.data || []) as string[];', errors: cast },
    { code: 'const a = (ok ? r?.data : null) as string[] | null;', errors: cast },
    { code: 'const a = (ok && data) as string[];', errors: cast },
    { code: 'const rows = r.data ?? []; const a = rows as string[];', errors: cast },
    {
      code: 'const { data } = r; const rows = data || []; const a = rows as string[];',
      errors: cast,
    },
  ],
});
