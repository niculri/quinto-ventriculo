// What the cards page says instead of its list: an assessment without an index yet, or cards changed since the page
// was opened.

import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { cardsStrings } from '../strings';

export function CardsMissing() {
  return (
    <div className="mt-6">
      <Notice title={cardsStrings.page.missingTitle} tone="info">
        {cardsStrings.page.missingBody}
      </Notice>
    </div>
  );
}

export function CardsChanged() {
  return (
    <div className="mt-6">
      <Notice title={cardsStrings.page.changedTitle} tone="info">
        <p>{cardsStrings.page.changedBody}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${button.base} ${button.secondary} mt-3`}
        >
          {cardsStrings.page.reload}
        </button>
      </Notice>
    </div>
  );
}
