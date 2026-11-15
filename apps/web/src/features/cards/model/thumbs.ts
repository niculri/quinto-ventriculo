// The URL of a thumbnail of the cards page's list, signed with the query the API gave.

import { apiPaths } from '@qv/schema/http';

export const thumbUrl = (thumb: string, query: string) => `${apiPaths.media(thumb)}?${query}`;
