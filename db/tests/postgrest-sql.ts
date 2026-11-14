// The SQL of the fake PostgREST: a URL's `select`, filters, order and page over a table or a function's rows,
// and the inserts, upserts, updates and deletes, all as one JSON array.
import type { asUser } from './pglite';
export type Tx = Parameters<Parameters<typeof asUser>[2]>[0];

const NAME = /^[a-z_][a-z0-9_]*$/;
export const quote = (name: string) => {
  if (!NAME.test(name)) throw new Unsupported(`name «${name}»`);
  return `"${name}"`;
};

export class Unsupported extends Error {}

export class Sql {
  readonly params: unknown[] = [];
  add(value: unknown) {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}
/** `select=…`, the filters, `order`, `limit` and `offset` of the URL over `from`, as one JSON array. */
export async function query(tx: Tx, sql: Sql, from: string, url: URL) {
  const columns = (url.searchParams.get('select') ?? '*')
    .split(',')
    .map((c) => (c === '*' ? '*' : quote(c)))
    .join(', ');
  const where = filters(sql, url, '_s');
  const order = orderBy(url);
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');
  const text = `select coalesce(json_agg(_t), '[]'::json) as r from (
      select ${columns} from ${from} as _s ${where ? `where ${where}` : ''} ${order}
      ${limit ? `limit ${Number(limit)}` : ''} ${offset ? `offset ${Number(offset)}` : ''}) _t`;
  const { rows } = await tx.query<{ r: unknown[] }>(text, sql.params);
  return rows[0]!.r;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const OPERATORS: Record<string, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

function filters(sql: Sql, url: URL, alias: string): string {
  const out: string[] = [];
  for (const [key, raw] of url.searchParams) {
    if (RESERVED.has(key)) continue;
    const column = `${alias}.${quote(key)}`;
    const not = raw.startsWith('not.');
    const [op, ...rest] = (not ? raw.slice(4) : raw).split('.');
    const value = rest.join('.');
    let condition: string;
    if (op === 'is' && value === 'null') condition = `${column} is null`;
    else if (op === 'in' && value.startsWith('(') && value.endsWith(')')) {
      condition = `${column}::text = any(${sql.add(list(value.slice(1, -1)))}::text[])`;
    } else if (op && OPERATORS[op]) condition = `${column} ${OPERATORS[op]} ${sql.add(value)}`;
    else throw new Unsupported(`filter ${key}=${raw}`);
    out.push(not ? `not (${condition})` : condition);
  }
  return out.join(' and ');
}

/** The values of `in.(…)`, with the quotes postgrest-js puts on those that have a comma or a parenthesis. */
function list(text: string): string[] {
  const values = text.match(/"[^"]*"|[^,]+/g) ?? [];
  return values.map((v) => (v.startsWith('"') ? v.slice(1, -1) : v));
}

function orderBy(url: URL): string {
  const order = url.searchParams.get('order');
  if (!order) return '';
  const terms = order.split(',').map((term) => {
    const [column, ...mods] = term.split('.');
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullsfirst')
      ? ' nulls first'
      : mods.includes('nullslast')
        ? ' nulls last'
        : '';
    return `${quote(column!)} ${dir}${nulls}`;
  });
  return `order by ${terms.join(', ')}`;
}

export async function write(
  tx: Tx,
  method: string,
  table: string,
  url: URL,
  body: unknown,
  prefer: string,
) {
  const sql = new Sql();
  const t = `public.${quote(table)}`;
  let statement: string;
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const keys = url.searchParams.get('columns')?.replaceAll('"', '').split(',') ?? [
      ...new Set(rows.flatMap((r) => Object.keys(r as object))),
    ];
    const cols = keys.map(quote).join(', ');
    statement = `insert into ${t} (${cols}) select ${cols} from json_populate_recordset(null::${t}, ${sql.add(
      JSON.stringify(rows),
    )}::json) ${await conflict(tx, table, keys, url, prefer)} returning *`;
  } else if (method === 'PATCH') {
    const keys = Object.keys(body as object);
    const where = filters(sql, url, t);
    statement = `update ${t} set ${keys.map((k) => `${quote(k)} = _v.${quote(k)}`).join(', ')}
      from json_populate_record(null::${t}, ${sql.add(JSON.stringify(body))}::json) as _v
      ${where ? `where ${where}` : ''} returning ${t}.*`;
  } else if (method === 'DELETE') {
    const where = filters(sql, url, t);
    statement = `delete from ${t} ${where ? `where ${where}` : ''} returning *`;
  } else throw new Unsupported(`method ${method}`);
  const { rows } = await tx.query<{ r: unknown[] }>(
    `with _w as (${statement}) select coalesce(json_agg(_w), '[]'::json) as r from _w`,
    sql.params,
  );
  return rows[0]!.r;
}

async function conflict(tx: Tx, table: string, keys: string[], url: URL, prefer: string) {
  if (!prefer.includes('resolution=')) return '';
  let target = url.searchParams.get('on_conflict')?.split(',');
  if (!target) {
    const { rows } = await tx.query<{ a: string }>(
      `select a.attname as a from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = $1::regclass and i.indisprimary`,
      [`public.${table}`],
    );
    target = rows.map((r) => r.a);
  }
  const on = `on conflict (${target.map(quote).join(', ')})`;
  if (prefer.includes('resolution=ignore-duplicates')) return `${on} do nothing`;
  const set = keys.filter((k) => !target.includes(k));
  return set.length
    ? `${on} do update set ${set.map((k) => `${quote(k)} = excluded.${quote(k)}`).join(', ')}`
    : `${on} do nothing`;
}

/** What a write returns with `select=…`: the columns asked for of the rows it wrote. */
export function pick(rows: Record<string, unknown>[], url: URL) {
  const select = url.searchParams.get('select');
  if (!select || select === '*') return rows;
  const columns = select.split(',');
  return rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
}
