// A section's list (for example, the subject its questions do not cover yet), folded, with sublists.
import type { QuizSectionSummary } from '@qv/schema';
import { Html } from './Html';

export function TopicListing({ listing }: { listing: NonNullable<QuizSectionSummary['listing']> }) {
  return (
    <details className="listado">
      <summary>
        <Html html={listing.title} />
      </summary>
      <ul>
        {listing.items.map((item, i) =>
          typeof item === 'string' ? (
            <li key={i}>
              <Html html={item} />
            </li>
          ) : (
            <li key={i} className="lsub">
              <details>
                <summary>
                  <Html html={item.title} />
                </summary>
                <ul>
                  {item.items.map((x, j) => (
                    <li key={j}>
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
