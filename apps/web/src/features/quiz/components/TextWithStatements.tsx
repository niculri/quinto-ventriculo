// A question's text with its statements «I. …, II. …» as a list between the text before and after them.
import { splitStatements } from '@qv/quiz';
import { keyed } from '../../../shared/lib/keyed';
import { textWithStatementsStrings as s } from './strings/TextWithStatements.strings';
import { Html } from './Html';

export function TextWithStatements({
  html,
  className,
  as = 'p',
}: {
  html: string;
  className: string;
  as?: 'p' | 'h2' | 'div';
}) {
  const split = splitStatements(html);
  if (!split) return <Html as={as} className={className} html={html} />;
  return (
    <>
      {split.before ? <Html as={as} className={className} html={split.before} /> : null}
      <ol className="afirm" aria-label={s.figures.statements}>
        {keyed(split.items, (it) => it.numeral).map(({ key, item }) => (
          <li key={key}>
            <span className="rn" aria-hidden="true">
              {item.numeral}.
            </span>
            <Html className="rt" html={item.html} />
          </li>
        ))}
      </ol>
      {split.after ? (
        <Html as={as === 'h2' ? 'p' : as} className={className} html={split.after} />
      ) : null}
    </>
  );
}
