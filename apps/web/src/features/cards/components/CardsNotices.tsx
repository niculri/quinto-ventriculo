// What the cards page says instead of its list: an assessment without an index yet, or cards changed since the page
// was opened.

import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { cardsNoticesStrings } from './strings/CardsNotices.strings';

export function CardsMissing() {
  return (
    <div className="mt-6">
      <Notice title={cardsNoticesStrings.page.missingTitle} tone="info">
        {cardsNoticesStrings.page.missingBody}
      </Notice>
    </div>
  );
}

export function CardsChanged() {
  return (
    <div className="mt-6">
      <Notice title={cardsNoticesStrings.page.changedTitle} tone="info">
        <p>{cardsNoticesStrings.page.changedBody}</p>
        <button
          type="button"
          // jsdom's location.reload can be neither stubbed nor observed.
          onClick={/* v8 ignore next */ () => window.location.reload()}
          className={`${button.base} ${button.secondary} mt-3`}
        >
          {cardsNoticesStrings.page.reload}
        </button>
      </Notice>
    </div>
  );
}
