// The next cards of a session asked for ahead of time: their content and, unless the browser saves data, their
// images, with the same signed URLs the card will show.
import type { QueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import { savesData } from '../../../shared/lib/preload';
import { warmImages } from '../../../shared/lib/warmImages';
import { cardQuery } from '../../decks/api/queries';
import type { CardKey } from '../../progress/api/repository';
import { upcomingImagesOf } from '../model/imagePreload';

export function prefetchCards(
  client: QueryClient,
  api: ApiClient,
  entries: readonly CardKey[],
): void {
  const saveData = savesData();
  for (const { noteGuid, ord } of entries) {
    void client
      .query(cardQuery(api, noteGuid, ord))
      .then((card) => warmImages(upcomingImagesOf(card, saveData), 'after'))
      .catch(() => undefined);
  }
}
