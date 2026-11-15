// A table of «Uso»: one row per deck, test, course or search, each name with its link and detail; and a list of
// label and figure pairs.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { card } from '../../../../shared/ui/styles';
import type { Named } from '../../model/usage';
import { usageStrings } from '../../usage.strings';

export interface UsageRow {
  key: string;
  named: Named;
  values: ReactNode[];
  indent?: boolean;
}

export function UsageTable({
  title,
  hideTitle = false,
  empty,
  columns,
  rows,
}: {
  title: string;
  hideTitle?: boolean;
  empty: string;
  columns: readonly string[];
  rows: UsageRow[];
}) {
  return (
    <div className={`${card} overflow-hidden`}>
      {hideTitle ? null : (
        <h4 className="border-b border-border px-4 py-2.5 text-sm font-semibold sm:px-5">
          {title}
        </h4>
      )}
      {rows.length ? (
        <table className="w-full text-sm sm:table-fixed">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">
                <span className="sr-only">{usageStrings.details.name}</span>
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-1.5 py-2 text-right leading-tight font-medium sm:w-[19%] sm:px-2"
                >
                  {c}
                </th>
              ))}
              <th aria-hidden="true" className="w-2 sm:w-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <TableRow key={r.key} row={r} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-3 text-sm text-muted sm:px-5">{empty}</p>
      )}
    </div>
  );
}

function TableRow({ row: r }: { row: UsageRow }) {
  return (
    <tr>
      {/* On the phone the table sizes its columns by their content: `w-full max-w-0` gives the name what the
          figures leave, so that the course's line (one line, cut) does not push the figures out of the card. */}
      <th
        scope="row"
        className={`min-w-0 py-2.5 pr-2 text-left font-normal max-sm:w-full max-sm:max-w-0 ${r.indent ? 'pl-8 sm:pl-10' : 'pl-4 sm:pl-5'}`}
      >
        <span className="line-clamp-2 break-words">
          {r.named.to ? (
            <Link to={r.named.to} className="text-ink hover:text-brand hover:underline">
              {r.named.name}
            </Link>
          ) : (
            r.named.name
          )}
        </span>
        {r.named.detail ? (
          <span className="block truncate text-xs text-muted">{r.named.detail}</span>
        ) : null}
      </th>
      {r.values.map((v, i) => (
        <td key={i} className="px-1.5 text-right whitespace-nowrap tabular-nums sm:px-2">
          {v}
        </td>
      ))}
      <td aria-hidden="true" />
    </tr>
  );
}

export function Pairs({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-3 divide-y divide-border text-sm first:mt-0">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-2">
          <dt className="text-muted">{label}</dt>
          <dd className="text-ink tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
