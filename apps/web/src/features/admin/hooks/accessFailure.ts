// What «Acceso» says when the database refuses (its own words) or the call does not arrive.
import { AccessError } from '../api/repository';
import { accessStrings } from '../access.strings';

export const accessFailure = (e: unknown) =>
  e instanceof AccessError ? e.message : accessStrings.genericFailure;
