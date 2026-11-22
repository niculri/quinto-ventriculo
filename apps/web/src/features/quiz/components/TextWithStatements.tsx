// A question's text with its statements «I. …, II. …» as a list between the text before and after them.
import { splitStatements } from '@qv/quiz';
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
        {split.items.map((item, i) => (
          <li key={i}>
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
