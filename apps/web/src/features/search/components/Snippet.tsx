// A search result's snippet, with its matches highlighted.
import { keyed } from '../../../shared/lib/keyed';
import { snippetParts } from '../model/snippet';

export function Snippet({ text }: { text: string }) {
  return (
    <>
      {keyed(snippetParts(text), (p) => `${p.highlighted ? 'mark' : 'text'}:${p.text}`).map(
        ({ key, item: p }) =>
          p.highlighted ? <mark key={key}>{p.text}</mark> : <span key={key}>{p.text}</span>,
      )}
    </>
  );
}
