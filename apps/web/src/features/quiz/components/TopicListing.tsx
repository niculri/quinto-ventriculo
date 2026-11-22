// A section's list (for example, the subject its questions do not cover yet), folded, with sublists.
import type { QuizSectionSummary } from '@qv/schema';
import { keyed } from '../../../shared/lib/keyed';
import { Html } from './Html';

export function TopicListing({ listing }: { listing: NonNullable<QuizSectionSummary['listing']> }) {
  return (
    <details className="listado">
      <summary>
        <Html html={listing.title} />
      </summary>
      <ul>
        {keyed(listing.items, (it) => (typeof it === 'string' ? it : it.title)).map(
          ({ key, item }) =>
            typeof item === 'string' ? (
              <li key={key}>
                <Html html={item} />
              </li>
            ) : (
              <li key={key} className="lsub">
                <details>
                  <summary>
                    <Html html={item.title} />
                  </summary>
                  <ul>
                    {keyed(item.items, (x) => x).map(({ key: subKey, item: x }) => (
                      <li key={subKey}>
                        <Html html={x} />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ),
        )}
      </ul>
    </details>
  );
}
