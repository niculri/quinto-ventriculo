// The rule against casting a database answer: every way of writing `data as T`, and the casts that are not on data.
import { noCastOnData } from '../noCastOnData.js';
import { code } from './ruleTester';

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
    // A name with no initializer, or one taken out of a list, is not known to come from `data`.
    'let rows; const a = rows as string[];',
    'const [rows] = list; const a = rows as string[];',
    // The key of a computed pattern is an expression, not the name `data`.
    'const { [data]: rows } = r; const a = rows as string[];',
    // Known limit: a name taken out of a list that comes from `data` is not followed.
    'const [rows] = data; const a = rows as string[];',
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
    // A chain of casts is one, whichever way each one is written, and a `satisfies` in the middle does not hide it.
    { code: 'const a = <string>(<unknown>data);', errors: cast },
    { code: 'const a = (data satisfies unknown) as string;', errors: cast },
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
