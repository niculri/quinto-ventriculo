// Saving a bundle of fixtures through the importer's real CloudTarget, for the tests of the content database.
import type { CloudTarget, SaveScope } from '@qv/importer';
import { bundleOf } from './importFixtures';
import type { Parts } from './importFixtures';

export const saveParts = (target: CloudTarget, parts: Parts, scope?: SaveScope) => {
  const { bundle, media } = bundleOf(parts);
  return target.save(bundle, media, scope);
};

/** Waits for the clock to move on, so that two writes get different times. */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
