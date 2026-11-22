// The bearer token of a request.
import { BearerToken } from '@qv/schema/http';

export function tokenFromHeader(header: string | undefined | null): string | null {
  const token = BearerToken.safeParse(header);
  return token.success ? token.data : null;
}
