// What the cards page says instead of its list: an assessment without an index yet, or cards changed since the page
// was opened.

import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';

export function CardsMissing() {
  return (
    <div className="mt-6">
      <Notice title="Todavía no se pueden explorar estas tarjetas" tone="info">
        Sus tarjetas se estudian desde la página del mazo.
      </Notice>
    </div>
  );
}

export function CardsChanged() {
  return (
    <div className="mt-6">
      <Notice title="Las tarjetas cambiaron" tone="info">
        <p>Las tarjetas se actualizaron mientras tenías abierta esta página.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${button.base} ${button.secondary} mt-3`}
        >
          Recargar
        </button>
      </Notice>
    </div>
  );
}
